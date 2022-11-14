const mqttClient = mqtt.connect('wss://home.lukeb.co.uk:8884', {
    username: 'public',
    password: 'public',
    connectTimeout: 10000,
    keepalive: 10
});

const topics = {
    ping: "public/tree/ping",
    status: "public/tree/status"
}

mqttClient.on('connect', () => {
    const status = document.querySelector('.connection-status');

    status.classList.add('connected');
    status.innerHTML = "You are connected to the server";

    mqttClient.subscribe(topics.ping);
});

let pingTimeout;

mqttClient.on('message', (topic, message) => {
    if (topic === topics.ping) {
        const status = document.querySelector('.tree-status');

        clearTimeout(pingTimeout);
        pingTimeout = setTimeout(() => {
            status.classList.remove('connected');
            status.innerHTML = "The tree is offline";
            document.querySelector('.submit').disabled = true;
        }, 20000);

        status.classList.add('connected');
        status.innerHTML = "The tree is online";

        document.querySelector('.submit').disabled = false;
    }
})

const noConnection = () => {
    const status = document.querySelector('.connection-status');
    status.classList.remove('connected');
    status.innerHTML = "You are disconnected from the server";

    document.querySelector('.submit').disabled = true;
};

mqttClient.on('close', noConnection)

mqttClient.on('offline', noConnection);

mqttClient.on('error', noConnection);

document.querySelector('.onPause').value = 1000;
document.querySelector('.onPause').addEventListener('input', function() {
    document.querySelector('.onPauseText').innerHTML = `${this.value/1000} seconds`;
});

document.querySelector('.offPause').value = 1000;
document.querySelector('.offPause').addEventListener('input', function () {
    document.querySelector('.offPauseText').innerHTML = `${this.value/1000} seconds`;
});

document.querySelectorAll('.state').forEach((el, i) => {
    if (i === 0) {
        el.checked = "checked";
    }

    el.addEventListener('change', function () {
        const sliders = document.querySelector('.sliders');
        if (this.value === 'FADE_ON' || this.value === 'FLASH_ON') {
            sliders.classList.add('show');
        } else {
            sliders.classList.remove('show');
        }

        const colorpicker = document.querySelector('.colors');
        if (this.value === "ON" || this.value === 'FADE_ON' || this.value === 'FLASH_ON') {
            colorpicker.classList.add('show');
        } else {
            colorpicker.classList.remove('show');
        }
    });
});

document.querySelectorAll('.color').forEach((el, i) => {
    if (i === 0) {
        el.checked = "checked";
    }

    el.addEventListener('change', function () {
        const colorpicker = document.querySelector('.colorpicker__wrapper');
        if (this.value === 'SOLID') {
            colorpicker.classList.add('show');
        } else {
            colorpicker.classList.remove('show');
        }
    });
});

let messageTimeout;

document.querySelector('.tree-form').addEventListener('submit', throttle(function(ev) {
    ev.preventDefault();
    const onPause = document.querySelector('.onPause').value;
    const offPause = document.querySelector('.offPause').value;
    const color = document.querySelector('.color:checked').value;
    const colorpicker = document.querySelector('.colorpicker').value;
    const state = document.querySelector('.state:checked').value;

    const message = document.querySelector('.message');

    message.innerHTML = 'Sending...'
    console.log(JSON.stringify({
        state,
        color: color === 'SOLID' ? colorpicker : color,
        onPause,
        offPause
    }));
    mqttClient.publish(
        topics.status,
        JSON.stringify({
            state,
            color: color === 'SOLID' ? colorpicker : color,
            onPause,
            offPause
        }),
        {
            qos: 1
        },
        (error) => {
            clearTimeout(messageTimeout);

            if (error) {
                message.innerHTML = 'Error sending command.'
            } else {
                message.innerHTML = 'Sent!'
            }

            messageTimeout = setTimeout(() => {
                message.innerHTML = '&nbsp;';
            }, 5000);
        }
    );
}, 1000));


function throttle(func, limit) {
    let inThrottle;
    return function (ev) {
        ev.preventDefault();
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit)
        }
    }
}
