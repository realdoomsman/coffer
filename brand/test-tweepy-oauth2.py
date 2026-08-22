"""Test X API posting with tweepy and OAuth 2.0."""
import tweepy
import json

# Load API keys
with open('C:/Users/Dooms/AppData/Local/hermes/profiles/twitter/secrets/x-api-keys.json') as f:
    keys = json.load(f)

try:
    # Use OAuth 2.0 Bearer Token approach
    client = tweepy.Client(
        bearer_token=None,  # We'll generate this
        consumer_key=keys['client_id'],
        consumer_secret=keys['client_secret'],
        access_token=keys['access_token'],
        access_token_secret=keys['access_token_secret'],
        wait_on_rate_limit=True
    )
    
    test_tweet = "TRADER VAULTS ON SOLANA\n\nBack the best traders. They can never run.\n\nTraders pool your capital, trade it, and take 30% of profits.\nBut they can never withdraw from the vault.\n\nCustody lives in a program-owned PDA. No code path moves funds to non-vault accounts.\n\n70% to depositors. 30% to traders. On-chain record.\n\ncoffer.fun"
    
    response = client.create_tweet(text=test_tweet)
    print(f'SUCCESS! Tweet posted.')
    print(f'Tweet ID: {response.data["id"]}')
    print(f'Tweet URL: https://x.com/CofferDotFun/status/{response.data["id"]}')
except Exception as e:
    print(f'Failed: {e}')
    import traceback
    traceback.print_exc()
