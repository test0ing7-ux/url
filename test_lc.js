fetch('https://leetcode.com/problems/two-sum/description/', {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate', 
        'sec-fetch-site': 'none',
        'sec-ch-ua': '"Chrome";v="131"',
        'accept': 'text/html',
        'accept-encoding': 'gzip',
        'accept-language': 'en-US'
    }
}).then(async r => {
    const text = await r.text();
    console.log('Status:', r.status);
    console.log('Server:', r.headers.get('server'));
    console.log('CF:', r.headers.get('cf-ray'));
    console.log('Body preview:', text.substring(0, 500));
}).catch(console.error);
