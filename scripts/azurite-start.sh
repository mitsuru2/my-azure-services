#!/bin/bash
# Windowリロードなどでこのスクリプトが再実行されても多重起動しないよう、
# 起動済みポートを検知した場合はスキップする。
if (echo > /dev/tcp/127.0.0.1/10000) 2>/dev/null; then
  echo "Azurite is already running. Skipping startup."
  echo "Azurite Blob service is successfully listening at http://127.0.0.1:10000"
else
  azurite --silent --location /workspaces/.azurite --debug /workspaces/.azurite/debug.log &
fi
