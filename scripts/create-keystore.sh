#!/bin/bash
set -e

# Helper to create a signing keystore for squidcloud
# DO NOT commit the generated keystore to version control.

KEYSTORE=${1:-squidcloud.keystore}
STOREPASS=${2:-fuckyouHACKER@1234}
ALIAS=${3:-squidcloud}
KEYPASS=${4:-fuckyouHACKER@1234}
keytool -genkeypair \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -keystore "$KEYSTORE" \
  -storepass "$STOREPASS" \
  -keypass "$KEYPASS" \
  -dname "CN=SquidCloud, OU=SquidCloud, O=SquidCloud, L=Unknown, S=Unknown, C=US"

echo "Created keystore: $KEYSTORE (storepass: $STOREPASS, alias: $ALIAS)"
