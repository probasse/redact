from flask import Flask, render_template, request, jsonify, send_from_directory
import re
import os
import time
import firebase_admin
from firebase_admin import credentials, firestore, auth
import stripe
import yaml
from dotenv import load_dotenv

# Load Environment Variables
flask_env = os.environ.get('FLASK_ENV', 'development')
env_file = '.env.production' if flask_env == 'production' else '.env.test' if flask_env == 'testing' else '.env'
print(f"Loading environment from {env_file} (FLASK_ENV={flask_env})")
load_dotenv(env_file)

app = Flask(__name__)

# --- SaaS Configuration ---
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
stripe.api_key = STRIPE_SECRET_KEY
stripe_webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')

# Firebase Admin Init
cred_path = os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH', 'serviceAccountKey.json')
try:
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print(f"Firebase Admin Initialized with {cred_path}")
    else:
        print(f"WARNING: {cred_path} not found. Firebase features will fail.")
        db = None
except Exception as e:
    # Catch all startup errors to prevent Gunicorn crash loops
    print(f"CRITICAL ERROR initializing Firebase: {e}")
    # Don't crash, just disable DB
    db = None

# --- Helpers ---
def verify_firebase_token(id_token):
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token['uid'], None
    except Exception as e:
        print(f"Token Verification Failed: {e}")
        error_msg = str(e)
        # Print more details if available
        if hasattr(e, 'message'):
            print(f"Error Message: {e.message}")
            error_msg += f" | {e.message}"
        if hasattr(e, 'http_response'):
             print(f"HTTP Response: {e.http_response}")
        return None, error_msg

# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/health')
def health_check():
    status = {
        'status': 'ok',
        'firebase_initialized': db is not None,
        'environment': flask_env
    }
    return jsonify(status)

@app.route('/pricing')
def pricing():
    return render_template('pricing.html', 
                           price_id_starter=os.getenv('PRICE_ID_STARTER'),
                           price_id_lite=os.getenv('PRICE_ID_LITE'),
                           price_id_pro=os.getenv('PRICE_ID_PRO'),
                           price_id_enterprise=os.getenv('PRICE_ID_ENTERPRISE'),
                           stripe_publishable_key=os.getenv('STRIPE_PUBLISHABLE_KEY'))

@app.route('/changelog')
def changelog():
    version_data = {}
    try:
        with open('version.yaml', 'r') as f:
            version_data = yaml.safe_load(f)
    except Exception as e:
        print(f"Error loading version.yaml: {e}")
        version_data = {'version': 'unknown', 'release_notes': []}
    return render_template('changelog.html', version_data=version_data)

# --- Gatekeeper Logic ---
@app.route('/api/check-usage', methods=['POST'])
def check_usage():
    if not db:
        return jsonify({'error': 'Server misconfigured (DB missing)'}), 500

    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Unauthorized'}), 401

    id_token = auth_header.split('Bearer ')[1]
    uid, error_msg = verify_firebase_token(id_token)
    if not uid:
        return jsonify({'error': f'Invalid Token: {error_msg}'}), 401

    # Check User in Firestore
    user_ref = db.collection('users').document(uid)
    doc = user_ref.get()

    if not doc.exists:
        # Create default free/none record if missing
        user_data = {
             'email': 'unknown', # Should fetch from auth user record if needed
             'subscriptionStatus': 'none',
             'usageCount': 0,
             'usageLimit': 5, # Free trial: 5 docs
             'planId': 'free'
        }
        user_ref.set(user_data)
    else:
        user_data = doc.to_dict()

    # Limit Check logic
    data = request.get_json(silent=True) or {}
    increment = data.get('count', 1)

    # Check Limits
    usage_count = user_data.get('usageCount', 0)
    usage_limit = user_data.get('usageLimit', 0)
    plan_id = user_data.get('planId', 'free')

    # Check Subscription Expiry (Skip for free tier usually, unless free tier has a time limit? Assuming Free is forever for now)
    # If the user is on a paid plan, check if the period has ended
    if plan_id != 'free':
        current_period_end = user_data.get('subscriptionCurrentPeriodEnd')
        if current_period_end:
            # Add a small grace period (e.g., 2 days) or strict? User requested "When validity dates are past"
            # Let's go strict but maybe allow minimal skew
            if time.time() > current_period_end:
                 return jsonify({
                    'allowed': False,
                    'reason': 'subscription_expired',
                    'message': 'Your subscription period has ended. Please renew to continue.'
                }), 403

    if usage_count + increment > usage_limit:
        return jsonify({
            'allowed': False,
            'reason': 'limit_reached',
            'current': usage_count,
            'limit': usage_limit
        }), 403

    # If Allowed, Increment Count by Batch Size
    # Note: In a real app, you might increment AFTER processing, 
    # but for "Gatekeeper" style, we lock it centrally here.
    user_ref.update({'usageCount': firestore.Increment(increment)})

    return jsonify({
        'allowed': True,
        'newCount': usage_count + increment,
        'limit': usage_limit
    })


@app.route('/generate_regex', methods=['POST'])
def generate_regex():
    data = request.get_json()
    sample_text = data.get('sample_text', '') # Changed key to match frontend 'sample_text'
    if not sample_text:
        # Check fallback 'text'
        sample_text = data.get('text', '')
        if not sample_text:
            return jsonify({'error': 'No text provided'}), 400
    
    # Heuristic: Escape text, then replace digits with \d+
    regex = re.escape(sample_text)
    
    # Replace escaped spaces with \s+ to handle variable whitespace
    regex = regex.replace(r'\ ', r'\s+')
    
    # Replace sequences of digits with \d{N} where N is length
    def repl_digits(match):
        s = match.group(0)
        return f"\\d{{{len(s)}}}"
        
    regex = re.sub(r'\d+', repl_digits, regex)
    
    return jsonify({'regex': regex})

# --- Stripe Routes ---

@app.route('/create-checkout-session', methods=['POST'])
def create_checkout_session():
    data = request.get_json()
    price_id = data.get('priceId')
    uid = data.get('uid') # Passed securely or verified via token context if improved

    # Verify token again to ensure the UID matches the requester? 
    # For MVP, assuming the client sends what they authenticated with. 
    # Ideally we'd parse the Auth header here again.
    
    # Security: Verify token to ensure the UID matches the requester.
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Unauthorized'}), 401
    
    token_uid, error_msg = verify_firebase_token(auth_header.split('Bearer ')[1])
    if not token_uid:
        return jsonify({'error': f'Invalid Token: {error_msg}'}), 401
    
    if token_uid != uid:
         return jsonify({'error': 'User mismatch'}), 403

    domain_url = os.getenv('DOMAIN', 'http://localhost:8080')

    print(f"DEBUG: Creating Session. PriceID: {price_id}, Domain: {domain_url}, Email: {data.get('email')}")

    try:
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            customer_email=data.get('email'), # Pre-fill email
            line_items=[
                {
                    'price': price_id,
                    'quantity': 1,
                },
            ],
            mode='subscription',
            success_url=domain_url + '/?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=domain_url + '/pricing',
            metadata={
                'firebase_uid': uid
            }
        )
        print(f"DEBUG: Session Created: {checkout_session.id}")
        return jsonify({'sessionId': checkout_session.id})
    except Exception as e:
        print(f"DEBUG: Stripe Error: {str(e)}")
        return jsonify({'error': str(e)}), 403

@app.route('/stripe_webhook', methods=['POST'])
def stripe_webhook():
    print("DEBUG: Webhook received")
    payload = request.get_data(as_text=True)
    sig_header = request.headers.get('Stripe-Signature')

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, stripe_webhook_secret
        )
    except ValueError as e:
        print("DEBUG: Webhook Error: Invalid payload")
        return 'Invalid payload', 400
    except stripe.error.SignatureVerificationError as e:
        print("DEBUG: Webhook Error: Invalid signature")
        return 'Invalid signature', 400

    print(f"DEBUG: Webhook Event type: {event['type']}")

    # Handle Events
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        handle_checkout_session(session)
    
    elif event['type'] == 'invoice.payment_succeeded':
        invoice = event['data']['object']
        handle_payment_succeeded(invoice)
        
    elif event['type'] == 'customer.subscription.deleted':
        sub = event['data']['object']
        handle_sub_deleted(sub)

    return jsonify({'status': 'success'})

def handle_checkout_session(session):
    print("DEBUG: Handling checkout session")
    uid = session.get('metadata', {}).get('firebase_uid')
    if not uid:
        print("DEBUG: No UID in session metadata")
        return
    
    customer_id = session.get('customer')
    subscription_id = session.get('subscription')
    
    print(f"DEBUG: Processing for UID: {uid}, Sub ID: {subscription_id}")

    try:
        # Retrieve Sub to get Plan info
        sub = stripe.Subscription.retrieve(subscription_id)
        if not sub or 'items' not in sub:
            print("DEBUG: Invalid subscription object retrieved")
            return
            
        price_id = sub['items']['data'][0]['price']['id']
        print(f"DEBUG: Retrieved Price ID: {price_id}")
        
        limit = 50 # Default Starter (50 docs)
        plan_name = "Starter"
        
        if price_id == os.getenv('PRICE_ID_LITE'):
            limit = 100
            plan_name = "Lite"
        elif price_id == os.getenv('PRICE_ID_PRO'):
            limit = 10000
            plan_name = "Pro"
        elif price_id == os.getenv('PRICE_ID_ENTERPRISE'):
            limit = 999999
            plan_name = "Enterprise"
            
        print(f"DEBUG: Selected Plan: {plan_name}, Limit: {limit}")

        # Update Firebase
        db.collection('users').document(uid).set({
            'checkSubscriptionId': subscription_id,
            'stripeCustomerId': customer_id,
            'subscriptionStatus': 'active',
            'planId': plan_name,
            'usageLimit': limit,
            'usageCount': 0, # Reset on upgrade
            'subscriptionCurrentPeriodEnd': sub['current_period_end']
        }, merge=True)
        print(f"DEBUG: User {uid} database updated successfully")
        
    except Exception as e:
        print(f"DEBUG: Error in handle_checkout_session: {e}")

@app.route('/cancel-subscription', methods=['POST'])
def cancel_subscription():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Unauthorized'}), 401

    id_token = auth_header.split('Bearer ')[1]
    uid, error_msg = verify_firebase_token(id_token)
    if not uid:
        return jsonify({'error': f'Invalid Token: {error_msg}'}), 401
        
    user_ref = db.collection('users').document(uid)
    doc = user_ref.get()
    
    if not doc.exists:
        return jsonify({'error': 'User not found'}), 404
        
    user_data = doc.to_dict()
    subscription_id = user_data.get('checkSubscriptionId')
    
    if not subscription_id:
        return jsonify({'error': 'No active subscription found'}), 400
        
    try:
        # Cancel at period end
        stripe.Subscription.modify(
            subscription_id,
            cancel_at_period_end=True
        )
        
        # Update Firestore immediately
        user_ref.update({
            'subscriptionStatus': 'canceling',
            'cancelAtPeriodEnd': True
        })
        
        return jsonify({'status': 'success', 'message': 'Subscription will end at the current period.'})
        
    except Exception as e:
        print(f"Error canceling subscription: {e}")
        return jsonify({'error': str(e)}), 500

def handle_payment_succeeded(invoice):
    customer_id = invoice['customer']
    subscription_id = invoice.get('subscription')
    
    if not subscription_id:
        print("DEBUG: Payment succeeded but no subscription ID found (One-time payment?)")
        return

    # Find user with this customer_id
    users = db.collection('users').where('stripeCustomerId', '==', customer_id).stream()
    
    # Fetch latest subscription data to get new period end
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        current_period_end = sub['current_period_end']
        status = sub['status']
        
        for user in users:
            # Reset usage for new billing cycle AND update validity
            user.reference.update({
                'usageCount': 0,
                'subscriptionCurrentPeriodEnd': current_period_end,
                'subscriptionStatus': status
            })
            print(f"Renewal processed for user {user.id}. New period end: {current_period_end}")
            
    except Exception as e:
        print(f"DEBUG: Error handling payment success renewal: {e}")

def handle_sub_deleted(sub):
    customer_id = sub['customer']
    users = db.collection('users').where('stripeCustomerId', '==', customer_id).stream()
    for user in users:
        user.reference.update({
            'subscriptionStatus': 'canceled',
            'usageLimit': 5, # Revert to free
            'planId': 'free'
        })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(debug=True, port=port, host='0.0.0.0')
