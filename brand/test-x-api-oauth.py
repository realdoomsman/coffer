"""Test X API posting for Coffer with OAuth 1.0a."""
import json
import urllib.parse
import urllib.request
import base64
import hmac
import hashlib
import time
import random

# Load API keys
with open('C:/Users/Dooms/AppData/Local/hermes/profiles/twitter/secrets/x-api-keys.json') as f:
    keys = json.load(f)

consumer_key = keys['api_key']
consumer_secret = keys['api_secret']
access_token = keys['access_token']
access_token_secret = keys['access_token_secret']

def generate_oauth_header(method, url, params=None):
    """Generate OAuth 1.0a authorization header."""
    if params is None:
        params = {}
    
    # OAuth parameters
    oauth_params = {
        'oauth_consumer_key': consumer_key,
        'oauth_nonce': str(random.randint(1000000000, 9999999999)),
        'oauth_signature_method': 'HMAC-SHA1',
        'oauth_timestamp': str(int(time.time())),
        'oauth_token': access_token,
        'oauth_version': '1.0'
    }
    
    # Combine all parameters
    all_params = {**oauth_params, **params}
    
    # Create parameter string
    param_string = '&'.join([f'{urllib.parse.quote(k, safe="")}:{urllib.parse.quote(str(all_params[k]), safe="")}' 
                             for k in sorted(all_params)])
    
    # Create base string
    encoded_url = urllib.parse.quote(url, safe='')
    encoded_param_string = urllib.parse.quote(param_string, safe='')
    base_string = f'{method.upper()}&{encoded_url}&{encoded_param_string}'
    
    # Create signing key
    signing_key = f'{urllib.parse.quote(consumer_secret, safe="")}&{urllib.parse.quote(access_token_secret, safe="")}'
    
    # Generate signature
    signature = base64.b64encode(hmac.new(
        signing_key.encode('utf-8'),
        base_string.encode('utf-8'),
        hashlib.sha1
    ).digest()).decode('utf-8')
    
    # Create OAuth header
    oauth_header = 'OAuth ' + ', '.join([
        f'{k}="{urllib.parse.quote(str(v), safe="")}"'
        for k, v in oauth_params.items()
    ] + [f'oauth_signature="{urllib.parse.quote(signature, safe="")}"'])
    
    return oauth_header

# Test posting a tweet
test_tweet = "TRADER VAULTS ON SOLANA\n\nBack the best traders. They can never run.\n\nTraders pool your capital, trade it, and take 30% of profits.\nBut they can never withdraw from the vault.\n\nCustody lives in a program-owned PDA. No code path moves funds to non-vault accounts.\n\n70% to depositors. 30% to traders. On-chain record.\n\ncoffer.fun"

tweet_url = 'https://api.twitter.com/2/tweets'
tweet_data = json.dumps({'text': test_tweet})

oauth_header = generate_oauth_header('POST', tweet_url)

req = urllib.request.Request(tweet_url, data=tweet_data.encode('utf-8'), headers={
    'Authorization': oauth_header,
    'Content-Type': 'application/json'
}, method='POST')

try:
    with urllib.request.urlopen(req) as response:
        tweet_response = json.loads(response.read())
        print(f"SUCCESS! Tweet posted.")
        print(f"Tweet ID: {tweet_response.get('data', {}).get('id')}")
        print(f"Tweet text: {tweet_response.get('data', {}).get('text')}")
        print(f"Tweet URL: https://x.com/CofferDotFun/status/{tweet_response.get('data', {}).get('id')}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}:")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Failed to post tweet: {e}")
    import traceback
    traceback.print_exc()
