"""Test X API posting with OAuth 2.0 Client Credentials."""
import json
import urllib.request
import base64

# Load API keys
with open('C:/Users/Dooms/AppData/Local/hermes/profiles/twitter/secrets/x-api-keys.json') as f:
    keys = json.load(f)

# Get bearer token using OAuth 2.0
auth_url = 'https://api.twitter.com/oauth2/token'
auth_data = 'grant_type=client_credentials'.encode('utf-8')

# Create Basic Auth header
auth_string = f'{keys["client_id"]}:{keys["client_secret"]}'
b64_auth = base64.b64encode(auth_string.encode('utf-8')).decode('utf-8')

auth_headers = {
    'Authorization': f'Basic {b64_auth}',
    'Content-Type': 'application/x-www-form-urlencoded'
}

req = urllib.request.Request(auth_url, data=auth_data, headers=auth_headers, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        auth_response = json.loads(response.read())
        bearer_token = auth_response['access_token']
        print("Got bearer token successfully")
except Exception as e:
    print(f"Failed to get bearer token: {e}")
    exit(1)

# Test posting a tweet
test_tweet = "TRADER VAULTS ON SOLANA\n\nBack the best traders. They can never run.\n\nTraders pool your capital, trade it, and take 30% of profits.\nBut they can never withdraw from the vault.\n\nCustody lives in a program-owned PDA. No code path moves funds to non-vault accounts.\n\n70% to depositors. 30% to traders. On-chain record.\n\ncoffer.fun"

tweet_url = 'https://api.twitter.com/2/tweets'
tweet_headers = {
    'Authorization': f'Bearer {bearer_token}',
    'Content-Type': 'application/json'
}
tweet_data = json.dumps({'text': test_tweet}).encode('utf-8')

req = urllib.request.Request(tweet_url, data=tweet_data, headers=tweet_headers, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        tweet_response = json.loads(response.read())
        print(f"SUCCESS! Tweet posted.")
        print(f"Tweet ID: {tweet_response.get('data', {}).get('id')}")
        print(f"Tweet URL: https://x.com/CofferDotFun/status/{tweet_response.get('data', {}).get('id')}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}:")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Failed to post tweet: {e}")
    import traceback
    traceback.print_exc()
