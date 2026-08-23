"""Post X API tweets using OAuth 1.0a authentication."""
import urllib.request
import urllib.parse
import json
import time
import hmac
import hashlib
import base64
import random

# Load API keys
with open('C:/Users/Dooms/AppData/Local/hermes/profiles/twitter/secrets/x-api-keys.json') as f:
    keys = json.load(f)

def generate_oauth1_header(method, url, params=None, body_params=None):
    """Generate OAuth 1.0a Authorization header."""
    consumer_key = keys["consumer_key"]
    consumer_secret = keys["consumer_secret"]
    access_token = keys["access_token"]
    access_token_secret = keys["access_token_secret"]
    
    # OAuth parameters
    oauth_params = {
        'oauth_consumer_key': consumer_key,
        'oauth_token': access_token,
        'oauth_signature_method': 'HMAC-SHA1',
        'oauth_timestamp': str(int(time.time())),
        'oauth_nonce': ''.join([str(random.randint(0, 9)) for _ in range(32)]),
        'oauth_version': '1.0'
    }
    
    # Combine all parameters for signature
    all_params = {}
    if params:
        all_params.update(params)
    all_params.update(oauth_params)
    
    # Create parameter string (sorted and encoded)
    param_string = '&'.join([
        f"{urllib.parse.quote(str(k), safe='')}={urllib.parse.quote(str(v), safe='')}"
        for k, v in sorted(all_params.items())
    ])
    
    # Create signature base string
    encoded_url = urllib.parse.quote(url, safe='')
    signature_base_string = f"{method.upper()}&{encoded_url}&{urllib.parse.quote(param_string, safe='')}"
    
    # Create signing key
    signing_key = f"{urllib.parse.quote(consumer_secret, safe='')}&{urllib.parse.quote(access_token_secret, safe='')}"
    
    # Generate signature
    signature = base64.b64encode(
        hmac.new(
            signing_key.encode('utf-8'),
            signature_base_string.encode('utf-8'),
            hashlib.sha1
        ).digest()
    ).decode('utf-8')
    
    # Build Authorization header
    oauth_params['oauth_signature'] = signature
    auth_header = 'OAuth ' + ', '.join([
        f'{k}="{urllib.parse.quote(str(v), safe="")}"'
        for k, v in sorted(oauth_params.items())
    ])
    
    return auth_header

def post_tweet(text, reply_to_id=None):
    """Post a tweet using OAuth 1.0a."""
    url = 'https://api.twitter.com/2/tweets'
    tweet_data = {'text': text}
    
    if reply_to_id:
        tweet_data['reply_settings'] = 'mentionedUsers'
        tweet_data['in_reply_to_tweet_id'] = reply_to_id
    
    body_json = json.dumps(tweet_data).encode('utf-8')
    
    auth_header = generate_oauth1_header('POST', url, body_params=tweet_data)
    
    headers = {
        'Authorization': auth_header,
        'Content-Type': 'application/json'
    }
    
    req = urllib.request.Request(url, data=body_json, headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            return result.get('data', {}).get('id'), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode()}"
    except Exception as e:
        return None, str(e)

def check_recent_posts(user_id, minutes=45):
    """Check if there are any posts in the last X minutes."""
    url = f'https://api.twitter.com/2/users/{user_id}/tweets?max_results=5&tweet.fields=created_at'
    auth_header = generate_oauth1_header('GET', url)
    req = urllib.request.Request(url, headers={'Authorization': auth_header})
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            if 'data' in result:
                cutoff = time.time() - (minutes * 60)
                for tweet in result['data']:
                    tweet_time = time.strptime(tweet['created_at'].replace('Z', '+0000'), "%Y-%m-%dT%H:%M:%S%z")
                    tweet_timestamp = int(time.mktime(tweet_time))
                    if tweet_timestamp > cutoff:
                        return True, tweet['id'], tweet['text'][:100]
            return False, None, None
    except Exception as e:
        return None, None, str(e)

def get_user_id():
    """Get the user ID for CofferDotFun account."""
    url = 'https://api.twitter.com/2/users/me?user.fields=id,username'
    auth_header = generate_oauth1_header('GET', url)
    req = urllib.request.Request(url, headers={'Authorization': auth_header})
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            return result.get('data', {}).get('id'), result.get('data', {}).get('username')
    except Exception as e:
        return None, None, str(e)

# Thread content: "How Vault Custody Works"
thread_tweets = [
    "How trader vault custody actually works.\n\nMost copy trading gives traders control over funds. This is the problem.\n\nOn Coffer, traders cannot withdraw. Ever.\n\nHere's the architecture:",
    "When you deposit into a vault, your funds go to a program-owned PDA.\n\nThe trader's authority allows them to:\n- Execute trades via Jupiter\n- Withdraw their 30% share of profits\n\nThey CANNOT:\n- Withdraw principal\n- Move funds to their wallet\n- Transfer to non-vault addresses",
    "This is enforced at the program level, not by a contract.\n\nThe PDA is derived from the vault seed.\nThe trader is a signer on the vault account.\nOnly the program can move funds out.",
    "What about profit distribution?\n\nWhen the trader realizes a gain:\n- 70% stays in the vault (depositor equity)\n- 30% is transferred to the trader (vested)\n\nBoth transfers happen in the same transaction.",
    "The 60-day vesting prevents rug pulls.\n\nIf the trader makes $10,000 on day 1:\n- $3,000 is allocated to them\n- They can only withdraw ~$50/day for 60 days\n\nIf they blow up the vault in week 2, the unvested portion stays with depositors.",
    "Compare this to standard copy trading:\n\nStandard:\n- Traders have full custody of your funds\n- They can exit with your capital anytime\n- No mechanism to prevent exit scams\n\nCoffer:\n- Traders never have custody\n- Funds are locked in program-owned PDA\n- Vesting prevents premature profit extraction",
    "This is the core value proposition:\n\nBack the best traders. They can never run.\n\n#Solana #DeFi #TraderVaults"
]

# Main execution
print("=" * 60)
print("Coffer X Twitter Poster")
print("=" * 60)

# Get user ID
user_id, username, error = get_user_id()
if error:
    print(f"ERROR getting user ID: {error}")
    exit(1)

print(f"Account: @{username} (ID: {user_id})")
print()

# Check recent posts
has_recent, recent_id, recent_text = check_recent_posts(user_id, 45)

if has_recent:
    print(f"RECENT POST FOUND (last 45 minutes):")
    print(f"ID: {recent_id}")
    print(f"Text: {recent_text}")
    print("\nSKIPPING - Already posted recently.")
    exit(0)
elif has_recent is None:
    print(f"WARNING: Could not check recent posts: {recent_id}")
    print("Proceeding with caution...")

print("No recent posts found. Proceeding to post thread...")
print()

# Post the thread
reply_to_id = None
posted_tweets = []

for i, tweet_text in enumerate(thread_tweets, 1):
    tweet_id, error = post_tweet(tweet_text, reply_to_id)
    
    if error:
        print(f"ERROR posting tweet {i}/{len(thread_tweets)}: {error}")
        if posted_tweets:
            print(f"\nPartially posted {len(posted_tweets)} tweets before failure.")
        exit(1)
    
    posted_tweets.append(tweet_id)
    reply_to_id = tweet_id
    
    print(f"Tweet {i}/{len(thread_tweets)} posted:")
    print(f"  ID: {tweet_id}")
    print(f"  URL: https://x.com/CofferDotFun/status/{tweet_id}")
    print(f"  Text: {tweet_text[:60]}...")
    print()
    
    # Small delay between tweets
    if i < len(thread_tweets):
        time.sleep(2)

print("=" * 60)
print(f"SUCCESS! Posted {len(posted_tweets)} tweets as a thread.")
print(f"Thread URL: https://x.com/CofferDotFun/status/{posted_tweets[0]}")
print("=" * 60)
