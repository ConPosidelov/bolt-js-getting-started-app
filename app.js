const { App } = require('@slack/bolt');
const moment = require('moment')
//const { PrismaClient } = require('@prisma/client')

/*const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
})*/

const config = require("dotenv").config().parsed;
// Overwrite env variables anyways
for (const k in config) {
  process.env[k] = config[k];
}
//console.log(process.env)

// Initializes the app with bot token and app token
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  customRoutes: [
    {
      path: '/health-check',
      method: ['GET'],
      handler: (req, res) => {
        console.log({ req, res })
        app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: 'C03HN1SFFAL',
          text: 'Health check test'
        })
        res.writeHead(200);
        res.end('Health check information displayed here!');
      },
    },
    
  ],
});

let users = null
let cache = {}

const getUsers = async ({ client }) => {
  const result = await client.users.list()
  return result.members
}

const getResponses = async ({ 
  userId, start, end, channelId, client, say, /*event,*/ messages }) => {
    
  let responses = []
  let prevTs = null
 
  const cacheId = 
    `${channelId}-${userId}-${start.format('DD-MM-yyyy')}-${end.format('DD-MM-yyyy')}`
  const cached = cache[cacheId]
  if (cached && (cached.length > 0 || cached.length === 0)) {
    if (moment().diff(end, 'days') > 0) { 
      return cached
    }
  }
  
  await Promise.all(messages.map(async r => {
    if (r.text.includes(`@${userId}`)) {
      prevTs = r.ts
    } else if (r.user == userId && prevTs) {
      const rt = +r.ts - prevTs
      prevTs = null
      responses.push({ user: userId, rt, text: r.text, ts: r.ts })
    } 
  }))
  cache[cacheId] = responses
  
  return responses
}

const humanizeDuration = d => {
  const s = d.get('seconds') ? `${d.get('seconds')}s ` : ''
  const m = d.get('minutes') ? `${d.get('minutes')}m ` : ''
  const h = d.get('hours') ? `${d.get('hours')}h ` : ''
  const days = d.get('days') ? `${d.get('days')} days ` : ''
  const months = d.get('months') ? `${d.get('months')} months ` : ''
  return `${months}${days}${h}${m}${s}`
}

const getStatistics = ({ responses }) => {
  if (responses && responses.length) {
    const nums = responses.map(e => e.rt)
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const avg = (nums.reduce((a, b) => a + b) / nums.length)
    /*const threshold = { d: 7, h: 24, m: 60, s: 60, ss: 0 }
    console.log({ 
      min: humanizeDuration(moment.duration(min, 'seconds'))
    })*/
    return {
      min: humanizeDuration(moment.duration(min, 'seconds')),
      max: humanizeDuration(moment.duration(max, 'seconds')),
      avg: humanizeDuration(moment.duration(avg, 'seconds')),
    }
  } 
  return {
    min: null, max: null, avg: null
  }
}

const getMessages = async ({ client, start, end, channel }) => {
  let messages = []
  const h = await client.conversations.history({
    channel,
    latest: end.unix(),
    oldest: start.unix(),
    inclusive: true,
    limit: 999,
    include_all_metadata: true
  })
  h.messages.sort((a, b) => +a.ts - b.ts)
  await Promise.all(h.messages.map(async e => {
    let replies = { messages: [e] }
    if (e.reply_count) {
      replies = await client.conversations.replies({
        channel,
        latest: end.unix(),
        oldest: start.unix(),
        inclusive: true,
        limit: 999,
        ts: e.ts
      })
      //replies.messages.sort((a, b) => +a.ts - b.ts)
    }
    replies.messages.map(r => messages.push(r))
  }))
  messages.sort((a, b) => +a.ts - b.ts)
  return messages
}

app.message('', async ({ message, say, client, event, ...r }) => {
  
  const thread_ts = message.thread_ts || message.ts;
 
  if (message.text.includes('show-user-info')) {

  }

  if (message.text.includes('show-users-log')) {
 
  }
});

app.command('/show-user-info', 
  async ({ command, ack, say, client, ...r }) => {
    
  await ack();
  
  const message = await client.chat.postMessage({ 
    text: 'Show user info: ',
    channel: command.channel_id
  })
  const thread_ts = message.ts
  
  const [user, channel, startDate, endDate] = command.text.split(' ')
  
  let userId = user ? (user.split('|')[0]).replace('<@', '') : command.user_id
  let userName = user ? (user.split('|')[1]).replace('>', '') : command.user_name
  if (!user) {
    await say({ 
      text: 'User not found. Using current user ' + 
        command.user_name,
        thread_ts 
    })
  } 
  
  let channelId = channel ? (channel.split('|')[0]).replace('<#', '') : command.channel_id
  if (!channel) {
    await say({ 
      text: 'Channel not found. Using current channel ' + 
        command.channel_name,
        thread_ts 
    })
  } 
  
  await say({ text: `Analyzing...`, thread_ts })
  const start = startDate ? moment(startDate) : moment().subtract(14, 'days')
  const end = endDate ? moment(endDate) : moment()
  const messages = await getMessages({ client, start, end, channel: channelId })
  const responses = await getResponses({ 
    userId, channelId, start, end, client, say, messages
  })
  const { min, max, avg } = getStatistics({ responses })
  await say({
    text: `
      User id ${userId}
      User name ${userName}
      Statistics for period 
        from ${start.format('DD-MM-yyyy')} 
        to ${end.format('DD-MM-yyyy')}:
      Min response = ${min || 'no data'} 
      Max response = ${max || 'no data'} 
      Avg response = ${avg || 'no data'} 
    `,
    thread_ts
  });
  await say({ text: `Done.`, thread_ts })
});


app.command('/show-users-log', 
  async ({ command, ack, say, client, ...r }) => {
  await ack();
  const message = await client.chat.postMessage({ 
    text: 'Show users log: ',
    channel: command.channel_id
  })
  const thread_ts = message.ts
  const [channel, seconds, startDate, endDate] = command.text.split(' ')
  let channelId = (channel.split('|')[0]).replace('<#', '')
  await say({ text: `Analyzing...`, thread_ts })
  const start = startDate ? moment(startDate) : moment().subtract(14, 'days')
  const end = endDate ? moment(endDate) : moment()
  await say({ text: `
    Statistics for period 
        from ${start.format('DD-MM-yyyy')} 
        to ${end.format('DD-MM-yyyy')}:
  `, thread_ts })
  
  const allUsers = users || (await getUsers({ client }))
  const messages = await getMessages({ client, start, end, channel: channelId })
  //console.log({ allUsers })
  await Promise.all(allUsers.map(async e => {
    
      const responses = await getResponses({ 
        userId: e.id, channelId, start, end, /*client, say,*/ messages 
      })
      console.log({ responses })
     
      if (!responses || !responses.length) {
        return
      }
      
      await Promise.all(responses.filter(r => r.rt > seconds)
        .map(async responce => {
          const link = await client.chat.getPermalink({ 
            channel: channelId, message_ts: responce.ts
          })
          await say({
            text: `
              User: ${e.name || 'name not found'}: 
              Date: ${moment.unix(+responce.ts).format('DD-MM-yyyy hh:mm:ss') || 'time stamp not found'}
              Response: ${humanizeDuration(moment.duration(responce.rt, 'seconds')) || 'responce time not found'}
              Text: ${responce.text || 'text not found'}
              Link: ${`<${link.permalink}|...>`}
              =================
              
          `,
            thread_ts
          })
        })
      )
    })
  )
  await say({ text: `Done.`, thread_ts })
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();