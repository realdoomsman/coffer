"""Check for mentions of Coffer using OAuth 1.0a User Context authentication."""
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

def get_user_id():
    """Get the user ID for CofferDotFun account."""
    url = 'https://api.twitter.com/2/users/me?user.fields=id,name,username'
    auth_header = generate_oauth1_header('GET', url)
    
    req = urllib.request.Request(url, headers={'Authorization': auth_header})
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            return result.get('data', {}).get('id'), result.get('data', {}).get('username')
    except urllib.error.HTTPError as e:
        print(f"Error getting user ID: {e.code}")
        print(e.read().decode())
        return None, None

def get_mentions(user_id):
    """Get mentions for the user."""
    url = f'https://api.twitter.com/2/users/{user_id}/mentions?tweet.fields=created_at,author_id,public_metrics,text,conversation_id&max_results=100&expansions=author_id&user.fields=username,name'
    
    auth_header = generate_oauth1_header('GET', url)
    req = urllib.request.Request(url, headers={'Authorization': auth_header})
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            return result
    except urllib.error.HTTPError as e:
        print(f"Error getting mentions: {e.code}")
        print(e.read().decode())
        return None

def search_tweets(query):
    """Search for tweets containing the query."""
    url = f'https://api.twitter.com/2/search/recent?query={urllib.parse.quote(query)}&tweet.fields=created_at,author_id,public_metrics,text&max_results=100&expansions=author_id&user.fields=username,name'
    
    auth_header = generate_oauth1_header('GET', url)
    req = urllib.request.Request(url, headers={'Authorization': auth_header})
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            return result
    except urllib.error.HTTPError as e:
        print(f"Error searching tweets: {e.code}")
        print(e.read().decode())
        return None

# Main execution
print("Checking Coffer mentions...")
print("=" * 60)

# Get user ID first
user_id, username = get_user_id()
if user_id:
    print(f"Account: @{username} (ID: {user_id})")
    print()
    
    # Get mentions
    print("Checking direct mentions...")
    mentions = get_mentions(user_id)
    
    if mentions and 'data' in mentions:
        tweets = mentions.get('data', [])
        users = {u['id']: u for u in mentions.get('includes', {}).get('users', [])}
        
        if tweets:
            print(f"Found {len(tweets)} mention(s):\n")
            for tweet in tweets:
                author = users.get(tweet['author_id'], {})
                print(f"From: @{author.get('username', 'unknown')} ({author.get('name', 'unknown')})")
                print(f"Text: {tweet['text']}")
                print(f"Created: {tweet['created_at']}")
                print(f"Metrics: {tweet.get('public_metrics', {})}")
                print("-" * 60)
        else:
            print("No direct mentions found.")
    else:
        print("No direct mentions found (or error fetching).")
    
    print()
    
    # Search for broader keywords
    search_queries = [
        'Coffer -coffee -cofferdam',
        'Coffer Solana trader vaults',
        '@CofferDotFun',
        '@Coffer',
        'trader vaults Solana'
    ]
    
    for query in search_queries:
        print(f"Searching for: '{query}'")
        results = search_tweets(query)
        
        if results and 'data' in results:
            tweets = results.get('data', [])
            users = {u['id']: u for u in results.get('includes', {}).get('users', [])}
            
            if tweets:
                print(f"  Found {len(tweets)} tweet(s):")
                for tweet in tweets[:5]:  # Limit to 5 per query
                    author = users.get(tweet['author_id'], {})
                    print(f"    - @{author.get('username', 'unknown')}: {tweet['text'][:100]}...")
            else:
                print(f"  No results.")
        else:
            print(f"  No results (or error).")
        print()
else:
    print("Failed to get user ID. Check API credentials.")

print("=" * 60)
print("Check complete.")
