const neopixel = require("neopixel");
const WiFi = require("Wifi");
const MQTT = require("MQTT");

const config = {
  wifi: {
    ssid: '',
    key: ''
  },
  mqtt: {
    broker: 'broker.shiftr.io',
    username: 'b349b5b8',
    password: '2b0eef12e27d76ef'
  },
  pixelPin: NodeMCU.D3,
  numPixels: 50,
  brightness: 10,
  onPause: 1000,
  offPause: 1000
};

const state = {
  state: {
    ledStatus: 'OFF',
    ledReverse: false,
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

const colours = [
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
];

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

function fadeAll() {
  let offset = 0;

  ledInterval = setInterval(() => {
    const colour = colours[offset];
    writeAll(colour[0], colour[1], colour[2]);
    offset = (offset + 1) % colours.length;
  }, 1);
}

function fadeCascade(reverse) {
  let offset = 0;

  ledInterval = setInterval(() => {
    const data = [].concat(colours.slice(offset, colours.length), colours.slice(0, offset));
    if (reverse) {
      data.reverse();
    }
    writePixels(data);
    offset = (offset + 1) % colours.length;
  }, 1);
}

function fadeBounce() {
  let offset = 0;
  let reverse = false;

  ledInterval = setInterval(() => {
    const data = [].concat(colours.slice(offset, colours.length), colours.slice(0, offset));
    writePixels(data);

    if (offset === colours.length) {
      reverse = true;
    } else if (offset === 0) {
      reverse = false;
    }

    if (reverse) {
      offset--;
    } else {
      offset++;
    }
  }, 1);
}

function fadeOn() {
    const currentState = state.getState();
    let fadeIn = true;
    let brightnessModifier = 0;

    const fadeLED = () => {
      if ((brightnessModifier.toFixed(1) == '0.0' && fadeIn === false) || (brightnessModifier.toFixed(1) === '1.0' && fadeIn === true)) {
        fadeIn = !fadeIn;

        clearInterval(ledInterval);

        const pauseTime = fadeIn ? currentState.offPause : currentState.onPause;

        ledTimeout = setTimeout(() => {
          ledInterval = setInterval(fadeLED, 100);
        }, pauseTime);
        return;
      }

      brightnessModifier = fadeIn ? brightnessModifier + 0.1 : brightnessModifier - 0.1;

      const ledColor = hexToRGB(currentState.ledColor);

      writeAll(ledColor[0], ledColor[1], ledColor[2], config.brightness * brightnessModifier);
    };

    ledInterval = setInterval(fadeLED, 100);
}

function flashOn() {
  const currentState = state.getState();
  let ledOn = false;

  const ledFlash = () => {
    const ledColor = hexToRGB(currentState.ledColor);
    writeAll(ledColor[0], ledColor[1], ledColor[2], config.brightness * ledOn);

    const pauseTime = ledOn ? currentState.onPause : currentState.offPause;

    ledTimeout = setTimeout(ledFlash, pauseTime);
    
    ledOn = !ledOn;
  };

  ledTimeout = setTimeout(ledFlash, currentState.offPause);
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
  pingInterval = setInterval(() => {
    mqtt.publish('ping', 'ping');
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
  console.log('MQTT disconnected, retrying');
  clearInterval(pingInterval);
  setTimeout(function () {
    mqtt.connect();
  }, 2500);
});

WiFi.connect(config.wifi.ssid, {
  password: config.wifi.key
});

WiFi.on('connected', () => {
  console.log('Connected to wifi');
  mqtt.connect();
});

WiFi.on('disconnected', () => {
  console.log('Wifi disconnected, rebooting');
  E.reboot();
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
    const ledColor = hexToRGB(currentState.ledColor);
    writeAll(ledColor[0], ledColor[1], ledColor[2]);
  } else if (currentState.ledStatus === "OFF") {
    writeAll(0, 0, 0);
  } else if (currentState.ledStatus === "FADE_ALL") {
    fadeAll();
  } else if (currentState.ledStatus === "FADE_CASCADE") {
    fadeCascade(currentState.ledReverse);
  } else if (currentState.ledStatus === "FADE_BOUNCE") {
    fadeBounce();
  } else if (currentState.ledStatus === "FADE_ON"){
    fadeOn();
  } else if (currentState.ledStatus === "FLASH_ON"){
    flashOn();
  }
}, 1000));