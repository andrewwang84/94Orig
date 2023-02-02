# 94Orig

## Info

- 2018/8/19 Andrew Wang
- This is a telegram bot for downloading instagram and twitter's original photo
- contains API for Web and for Bot
- Backend API is built with Express & Cheerio & puppeteer
- Telegam Bot is built with node-telegram-bot-api

## Feature

- [X] IG image
- [X] IG video
- [X] IG Story image
- [X] IG Story video
- [X] Twitter image
- [X] Twitter video

## Input

- Instagram
  - https://www.instagram.com/p/[postId]/
  - https://instagram.com/[userName] //stories
  - https://www.instagram.com/[userName] //stories
- Twitter
  - https://twitter.com/[userName]/status/[postId]
- Seperate multi urls with new line

#### in order to let the bot work, set up the following vars in cred.tmp.js

- insCookies: [instagram login cookie]
- NODE_ENV: production
- telegramToken: [telegram bot token, you can recieve it from bot father]
- twitterToken: [twitter bearer token for api access]

cause the region difference, I highly recommend not to use your own instagram account in this bot
