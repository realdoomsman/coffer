"""Check X API credit status."""
import urllib.request
import json

# Load API keys
with open('C:/Users/Dooms/AppData/Local/hermes/profiles/twitter/secrets/x-api-keys.json') as f:
    keys = json.load(f)

# Try to get rate limit status
url = 'https://api.twitter.com/2/users/me?user.fields=id,name,username'
auth_header = f'Bearer {keys["access_token"]}'

req = urllib.request.Request(url, headers={'Authorization': auth_header})

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read())
        print(f"Account: {result.get('data', {}).get('username')} ({result.get('data', {}).get('name')})")
        print(f"User ID: {result.get('data', {}).get('id')}")
        
        # Check rate limit headers
        rate_limit = response.headers.get('x-rate-limit-remaining', 'unknown')
        rate_limit_reset = response.headers.get('x-rate-limit-reset', 'unknown')
        print(f"\nRate Limit Remaining: {rate_limit}")
        print(f"Rate Limit Reset: {rate_limit_reset}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode()}")
except Exception as e:
    print(f"Failed: {e}")
    import traceback
    traceback.print_exc()
