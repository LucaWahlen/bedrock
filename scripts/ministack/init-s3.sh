#!/bin/sh
set -eu

bucket="bedrock-media"

aws s3api create-bucket --bucket "$bucket" 2>/dev/null || true

aws s3api put-bucket-cors \
  --bucket "$bucket" \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedOrigins": ["http://localhost:3000"],
        "AllowedMethods": ["GET", "PUT"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600
      }
    ]
  }'

aws s3api put-bucket-policy \
  --bucket "$bucket" \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Principal\": \"*\",
        \"Action\": \"s3:GetObject\",
        \"Resource\": \"arn:aws:s3:::$bucket/*\"
      }
    ]
  }"

# Branding media is staged before an organization exists; abandoned staging
# objects are user-owned and short-lived, so they expire. Mirror this rule on
# the production R2 bucket.
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$bucket" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-staging-branding",
        "Status": "Enabled",
        "Filter": { "Prefix": "staging/organization-branding/" },
        "Expiration": { "Days": 1 }
      }
    ]
  }'
