# ChatGPT Library Native Select All Images UserScript

Adds a **Select all** button to the ChatGPT image Library.

The script uses ChatGPT's own image selection controls. It does not make its own selection system.

## Install

Install a userscript manager:

- Tampermonkey
- Violentmonkey

Then install:

`chatgpt-library-native-select-all.user.js`

## Use

1. Open **ChatGPT > Library > Images**.
2. Select one image.
3. Click **Select all**.
4. Use ChatGPT's normal **Download** or **Delete** button.

## Notes

- The script only selects images that are loaded on the page.
- Scroll down first if you want to load more images.
- The script keeps images that are already selected.
- The script does not call private ChatGPT APIs.
- The script does not send data anywhere.
- The script uses no special userscript permissions.

## Compatibility

Works on:

~~~text
https://chatgpt.com/*
https://www.chatgpt.com/*
~~~

ChatGPT can change its web interface at any time. A future update can break the script.

