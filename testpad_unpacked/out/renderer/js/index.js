const { receiveFromMain } = window.api;

function checkForInviteLink(link) {
    return link.includes('/invite/');
}

async function checkInviteTest(link) {
    link = link.replace('/invite/', '/validateToken/');
    const rowResponse = await fetch(link);
    const response = await rowResponse.json();
    if (response.error) {
        throw new Error(response.error);
    }
}

const typeOfMessage = {
    'error': 1,
    'success': 2,
}

const showAlert = (message, type) => {
    const alert = document.getElementById('alert-message');
    switch (type){
        case typeOfMessage.error: {
            alert.classList.remove('alert-success');
            alert.classList.add('alert-danger')
            break;
        }
        case typeOfMessage.success: {
            alert.classList.add('alert-success');
            alert.classList.remove('alert-danger');
            break;
        }
    }
    alert.innerText = message;
    alert.style.top = '10px';
    setTimeout(() => {
        alert.style.top = '-80px';
    }, 4000);
}

function setLoading (state) {
    if(state) {
        document.getElementById('loading-background').classList.remove('hide');
        document.getElementById('loader').classList.remove('hide');
    } else {
        document.getElementById('loading-background').classList.add('hide');
        document.getElementById('loader').classList.add('hide');
    }
}

receiveFromMain('window-load-failed', async (url) => {
    setLoading(false);
    showAlert('Failed to load, please check your internet connection.', typeOfMessage.error);
    document.getElementById("goToBtn").disabled = false;
});

receiveFromMain('url', async (url) => {
    setLoading(true);
    try{
        if(!url.trim()) {
            return ;
        }
        url = url.split('/login')[0].trim();
        let isValid = false;
        for ( let i=0; i< valid_urls.length; ++i ) {
            if (url.startsWith(valid_urls[i])) {
                isValid = true;
                break;
            }
        }
        if (!isValid) throw new Error(`Unsupported application.`);
        await window.api.invoke('startQuiz', url);
        console.log('loading')
    } catch (error) {
        showAlert(error?.message,typeOfMessage.error);
        setLoading(false);
    }
});

const removeElements = () => {
    document.getElementById('link-form').remove();
    document.getElementById('versionError').innerText = `Please update your app version.`;
};

const getData = async (url) => {
    try {
        url = url.replace('tests.','');
        url = url.replace('exam.test.', 'test.');
        url = url.replace('exam.', 'assess.');
        if(url.indexOf('localhost') !=-1)
            url = url.replace('3000','3003');
        const rawResponse  = await fetch(`${url}?json=1`);
        const response = await rawResponse.json();
        return response;
    } catch (error) {
        throw new Error(error?.message ?? error);
    }
}

async function handleInviteLink(link) {
    let isValid = false;
    for (let element of valid_urls){
        if(link.startsWith(element)) {
            isValid = true;
            break
        }
    }
    if (!isValid) {
        throw new Error('Link is not valid');
    }
    await checkInviteTest(link);
    const result = await window.api.invoke('startQuiz', link);
    if (!result) throw new Error('Link is not valid.')
}

const startTest = async () => {
    if (!navigator.onLine) {
        showAlert('No internet connection.', typeOfMessage.error);
        return
    }
    setLoading(true)
    try {
        document.getElementById("goToBtn").disabled = true;
        var link = document.getElementById('link-input').value.trim();
        const quizBaseURL = window.api.quizURL();
        link = link.replace('/login', '');
        const isInviteLink = checkForInviteLink(link);
        if (isInviteLink) {
            await handleInviteLink(link);
            return;
        }
        const splitLink = link?.split('/');
        let token = null;
        while(true) {
            if (!splitLink.length) break;
            token = splitLink.pop().trim();
            if (token) {
                break;
            }
        }
        var url = null;
        if(link.startsWith('http://') || link.startsWith('https://')) {
            url = link;
        } else {
            if (!token) throw new Error('Link is not valid');
            url = quizBaseURL + '/test/' + token;
        }
        if (!link || !url)  throw new Error('Please enter test link');
        let isValid = false;
        for ( let i=0; i< valid_urls.length; ++i ) {
            if (url.startsWith(valid_urls[i])) {
                isValid = true;
                break;
            }
        }
        if (!isValid) throw new Error(`Unsupported application.`);
        const isTest = await getData(url);
        if (isTest?.error)  {
            throw new Error(isTest.error);
        } else if (isTest.quiz) {
            const result = await window.api.invoke('startQuiz', url);
            if (!result) throw new Error('Link is not valid.')
            return
        } else {
            throw new Error('Test not found');
        }
    } catch (error) {
        console.log(error);
        showAlert(error?.message, typeOfMessage.error)
        document.getElementById("goToBtn").disabled = false;
        document.getElementById("link-input").focus();
        setLoading(false)
    }
}