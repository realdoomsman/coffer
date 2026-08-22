"""Test X API posting for Coffer."""
import json
import urllib.parse
import urllib.request
import base64

# Load API keys
with open('C:/Users/Dooms/AppData/Local/hermes/profiles/twitter/secrets/x-api-keys.json') as f:
    keys = json.load(f)

# Create bearer token from API keys
consumer_key = keys['api_key']
consumer_secret = keys['api_secret']

# Encode keys for Basic Auth
key_secret = f'{consumer_key}:{consumer_secret}'.encode('utf-8')
b64_encoded_key = base64.b64encode(key_secret).decode('utf-8')

# Get bearer token
auth_url = 'https://api.twitter.com/oauth2/token'
auth_headers = {
    'Authorization': f'Basic {b64_encoded_key}',
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
}
auth_data = 'grant_type=client_credentials'.encode('utf-8')

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
        print(f"SUCCESS! Tweet posted. Tweet ID: {tweet_response.get('data', {}).get('id')}")
        print(f"Tweet text: {tweet_response.get('data', {}).get('text')}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(f"Response: {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Failed to post tweet: {e}")
