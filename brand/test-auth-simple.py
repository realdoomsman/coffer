import json, urllib.request, urllib.parse, time, hmac, hashlib, base64, random

with open('C:/Users/Dooms/AppData/Local/hermes/profiles/twitter/secrets/x-api-keys.json') as f:
    keys = json.load(f)

# Print what keys we have
print("Available keys in file:")
for k in keys.keys():
    print(f"  - {k}")
print()

# Test simple endpoint
url = 'https://api.twitter.com/2/users/me?user.fields=id,username'
consumer_key = keys['consumer_key']
consumer_secret = keys['consumer_secret']
access_token = keys['access_token']
access_token_secret = keys['access_token_secret']

print(f"Consumer Key: {consumer_key[:10]}...")
print(f"Consumer Secret: {consumer_secret[:10]}...")
print(f"Access Token: {access_token[:10]}...")
print(f"Access Token Secret: {access_token_secret[:10]}...")
print()

oauth_params = {
    'oauth_consumer_key': consumer_key,
    'oauth_token': access_token,
    'oauth_signature_method': 'HMAC-SHA1',
    'oauth_timestamp': str(int(time.time())),
    'oauth_nonce': ''.join([str(random.randint(0, 9)) for _ in range(32)]),
    'oauth_version': '1.0'
}

param_string = '&'.join([f"{urllib.parse.quote(str(k), safe='')}={urllib.parse.quote(str(v), safe='')}" for k, v in sorted(oauth_params.items())])
encoded_url = urllib.parse.quote(url, safe='')
signature_base_string = f"GET&{encoded_url}&{urllib.parse.quote(param_string, safe='')}"
signing_key = f"{urllib.parse.quote(consumer_secret, safe='')}&{urllib.parse.quote(access_token_secret, safe='')}"
signature = base64.b64encode(hmac.new(signing_key.encode('utf-8'), signature_base_string.encode('utf-8'), hashlib.sha1).digest()).decode('utf-8')

oauth_params['oauth_signature'] = signature
auth_header = 'OAuth ' + ', '.join([f'{k}="{urllib.parse.quote(str(v), safe="")}"' for k, v in sorted(oauth_params.items())])

print(f"Auth Header: {auth_header[:100]}...")
print()

req = urllib.request.Request(url, headers={'Authorization': auth_header})

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read())
        print('SUCCESS: User ID =', result.get('data', {}).get('id'))
        print('Username =', result.get('data', {}).get('username'))
except Exception as e:
    print('FAILED:', str(e))
    import traceback
    traceback.print_exc()
