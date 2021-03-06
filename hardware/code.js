const neopixel = require("neopixel");
const WiFi = require("Wifi");
const MQTT = require("MQTT");

const config = {
  wifi: {
    ssid: 'PLUSNET-XFSR',
    key: '926a8a26c2'
  },
  mqtt: {
    broker: 'broker.shiftr.io',
    username: 'b349b5b8',
    password: '2b0eef12e27d76ef',
    keep_alive: 5
  },
  pixelPin: NodeMCU.D3,
  numPixels: 50,
  brightness: 50,
  onPause: 1000,
  offPause: 1000
};

const state = {
  state: {
    ledStatus: 'OFF',
    ledColor: 'ffffff'
  },
  listeners: [],
  getState: () => {
    return JSON.parse(JSON.stringify(state.state));
  },
  dispatch: (action) => {
    state.state = (function (state, action) {
      if (action.type === 'UPDATE_LED_STATUS') {
        state.ledStatus = action.data.state;
        state.ledReverse = action.data.reverse || false;
        state.ledColor = action.data.color || 'ffffff';
        state.onPause = Math.min(Math.max((parseInt(action.data.onPause, 10) || config.onPause), 200), 2000);
        state.offPause = Math.min(Math.max((parseInt(action.data.offPause, 10) || config.offPause), 200), 2000);
      }

      return state;
    })(state.getState(), action);

    for (let i = 0; i < state.listeners.length; i++) {
      state.listeners[i]();
    }
  },
  subscribe: function (listener) {
    state.listeners.push(listener);
  }
};

const rainbow = {
  colors: [
    [255, 0, 0],
    [255, 18, 0],
    [255, 36, 0],
    [255, 54, 0],
    [255, 72, 0],
    [255, 90, 0],
    [255, 108, 0],
    [255, 127, 0],
    [255, 145, 0],
    [255, 163, 0],
    [255, 181, 0],
    [255, 200, 0],
    [255, 218, 0],
    [255, 236, 0],
    [255, 255, 0],
    [218, 255, 0],
    [182, 255, 0],
    [145, 255, 0],
    [109, 255, 0],
    [72, 255, 0],
    [36, 255, 0],
    [0, 255, 0],
    [0, 218, 36],
    [0, 182, 72],
    [0, 145, 109],
    [0, 109, 145],
    [0, 72, 182],
    [0, 36, 218],
    [0, 0, 255],
    [6, 6, 232],
    [13, 12, 209],
    [19, 18, 186],
    [26, 24, 163],
    [32, 30, 140],
    [39, 36, 117],
    [46, 43, 95],
    [59, 36, 117],
    [72, 30, 140],
    [85, 24, 163],
    [99, 18, 186],
    [112, 12, 209],
    [125, 6, 232],
    [139, 0, 255],
    [153, 0, 223],
    [168, 0, 191],
    [182, 0, 159],
    [197, 0, 127],
    [211, 0, 95],
    [226, 0, 63],
    [240, 0, 31]
  ]
};

setInterval(() => {
  rainbow.colors.push(rainbow.colors.shift());
}, 350);

function init() {
  writeAll(0, 0, 0);
}

function throttle(func, limit) {
  let inThrottle;
  return function (ev) {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        func.apply(context, args);
      }, limit);
    }
  };
}

function hexToRGB(hex){
  if (hex[0] === '#') {
    hex = hex.slice(1, hex.length);
  }

  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ];
}

function writeAll(r, g, b, brightness) {
  if (brightness === undefined) {
    brightness = config.brightness;
  }
  const data = [];
  for (let i = 0; i < config.numPixels; i++) {
    data.push(
      adjustBrightness(g, brightness),
      adjustBrightness(r, brightness),
      adjustBrightness(b, brightness)
    );
  }
  neopixel.write(config.pixelPin, data);
}

function writePixels(pixelColours, brightness) {
  if (brightness === undefined) {
    brightness = config.brightness;
  }
  const data = [];
  pixelColours.forEach((pixelColours) => {
    data.push(
      adjustBrightness(pixelColours[1], brightness),
      adjustBrightness(pixelColours[0], brightness),
      adjustBrightness(pixelColours[2], brightness)
    );
  });
  neopixel.write(config.pixelPin, data);
}

function adjustBrightness(i, brightness) {
  return Math.round((i / 100) * brightness);
}

let ledInterval;
let ledTimeout;

function fadeCascade() {
  ledInterval = setInterval(() => {
    writePixels(rainbow.colors);
  }, 350);
}

function twinkleCascade() {
  let twinkle = false;

  ledInterval = setInterval(() => {
    if (twinkle) {
       writePixels([].concat(rainbow.colors.slice(2, rainbow.colors.length), rainbow.colors.slice(0, 2)));
    } else {
      writePixels(rainbow.colors);
    }
    twinkle = !twinkle;
  }, 350);
}

function fadeBounce() {
  let offset = 0;
  let reverse = false;

  ledInterval = setInterval(() => {
    const data = [].concat(rainbow.colors.slice(offset, rainbow.colors.length), rainbow.colors.slice(0, offset));
    writePixels(data);

    if (offset === rainbow.colors.length) {
      reverse = true;
    } else if (offset === 0) {
      reverse = false;
    }

    if (reverse) {
      offset--;
    } else {
      offset++;
    }
  }, 350);
}

function fadeOn() {
    const currentState = state.getState();
    let fadeIn = true;
    let fading = true;
    let brightnessModifier = 0;

    const fadeLED = () => {
      if ((brightnessModifier.toFixed(1) == '0.0' && fadeIn === false) || (brightnessModifier.toFixed(1) === '1.0' && fadeIn === true)) {
        fading = false;
        fadeIn = !fadeIn;

        const pauseTime = fadeIn ? currentState.offPause : currentState.onPause;

        ledTimeout = setTimeout(() => {
          fading = true;
        }, pauseTime);
        return;
      }

      if (fading) {
        brightnessModifier = fadeIn ? brightnessModifier + 0.1 : brightnessModifier - 0.1;
      }

      const ledColor = currentState.ledColor === 'RAINBOW' ? rainbow.colors[0] : hexToRGB(currentState.ledColor);

      writeAll(ledColor[0], ledColor[1], ledColor[2], config.brightness * brightnessModifier);
    };

    ledInterval = setInterval(fadeLED, 350);
}

function flashOn() {
  const currentState = state.getState();
  let ledOn = false;

  const ledFlash = () => {
    const ledColor = currentState.ledColor === 'RAINBOW' ? rainbow.colors[0] : hexToRGB(currentState.ledColor);

    writeAll(ledColor[0], ledColor[1], ledColor[2], config.brightness * ledOn);

    const pauseTime = ledOn ? currentState.onPause : currentState.offPause;

    ledTimeout = setTimeout(ledFlash, pauseTime);

    ledOn = !ledOn;
  };

  ledTimeout = setTimeout(ledFlash, currentState.offPause);
}

function on() {
  const currentState = state.getState();
  if (currentState.ledColor === 'RAINBOW') {
    ledInterval = setInterval(() => {
      const ledColor = rainbow.colors[0];
      writeAll(ledColor[0], ledColor[1], ledColor[2]);
    }, 350);
  } else {
    const ledColor = hexToRGB(currentState.ledColor);
    writeAll(ledColor[0], ledColor[1], ledColor[2]);
  }

}

init();

let pingInterval;

const mqtt = MQTT.create(config.mqtt.broker, {
  username: config.mqtt.username,
  password: config.mqtt.password,
  keep_alive: 10
});

mqtt.on('connected', function () {
  console.log('Connected to MQTT');

  mqtt.subscribe('status');
  mqtt.subscribe('pong');

  if (ledInterval) {
    clearInterval(ledInterval);
    ledInterval = undefined;
  }

  if (ledTimeout) {
    clearTimeout(ledTimeout);
    ledTimeout = undefined;
  }

  twinkleCascade();

  pingInterval = setInterval(() => {
    mqtt.publish('ping', 'ping', { qos : 1, retain : false, dup : false });
  }, 5000);
});

mqtt.on('publish', function (pub) {
  if (pub.topic === 'status') {
    try {
      state.dispatch({
        type: 'UPDATE_LED_STATUS',
        data: JSON.parse(pub.message)
      });
    } catch (e) {}
  }
});

mqtt.on('disconnected', function () {
  console.log('MQTT disconnected');
  clearInterval(pingInterval);
  setTimeout(function () {
    console.log('Cycling Wifi');
    WiFi.disconnect();
  }, 2500);
});

function connectWifi() {
  WiFi.connect(config.wifi.ssid, {
    password: config.wifi.key
  });
}
connectWifi();

WiFi.on('connected', () => {
  console.log('Connected to wifi');
  mqtt.connect();
});

WiFi.on('disconnected', () => {
  console.log('Wifi disconnected');
  setTimeout(function () {
    console.log('Reconnecting Wifi');
    connectWifi();
  }, 2500);
});

WiFi.stopAP();

state.subscribe(throttle(() => {
  const currentState = state.getState();

  if (ledInterval) {
    clearInterval(ledInterval);
    ledInterval = undefined;
  }

  if (ledTimeout) {
    clearTimeout(ledTimeout);
    ledTimeout = undefined;
  }

  if (currentState.ledStatus === "ON") {
    on();
  } else if (currentState.ledStatus === "OFF") {
    writeAll(0, 0, 0);
  } else if (currentState.ledStatus === "FADE_CASCADE") {
    fadeCascade();
  } else if (currentState.ledStatus === "TWINKLE_CASCADE") {
    twinkleCascade();
  } else if (currentState.ledStatus === "FADE_BOUNCE") {
    fadeBounce();
  } else if (currentState.ledStatus === "FADE_ON"){
    fadeOn();
  } else if (currentState.ledStatus === "FLASH_ON"){
    flashOn();
  }
}, 1000));
