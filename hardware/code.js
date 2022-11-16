const neopixel = require("neopixel");
const WiFi = require("Wifi");
const MQTT = require("MQTT");

const config = {
  wifi: {
    ssid: "PLUSNET-XFSR",
    key: "926a8a26c2",
  },
  mqtt: {
    broker: "home.lukeb.co.uk:8883",
    username: "public",
    password: "public",
    topics: {
      ping: "public/tree/ping",
      status: "public/tree/status",
    },
  },
  pixelPin: NodeMCU.D3,
  numPixels: 50,
  brightness: 50,
  onPause: 1000,
  offPause: 1000,
};

const state = {
  ledStatus: "OFF",
  ledColor: "ffffff",
  offPause: config.offPause,
  onPause: config.onPause,
  ledInterval: 0,
  ledTimeout: 0,
  pingInterval: 0,
  rainbowOffset: 0,
};

const rainbow = {
  baseColors: [
    [255, 0, 0],
    [255, 255, 0],
    [0, 255, 0],
    [0, 255, 255],
    [0, 0, 255],
    [255, 0, 255],
  ],
  colors: [],
  getColors: function () {
    return this.colors.slice(0, (config.numPixels - 1) * 3);
  },
};

function setup() {
  const steps = Math.ceil(config.numPixels / rainbow.baseColors.length);

  rainbow.baseColors.forEach((color, i) => {
    const nextColor = rainbow.baseColors[(i + 1) % rainbow.baseColors.length];
    const stepSize = {
      r: (nextColor[0] - color[0]) / steps,
      g: (nextColor[1] - color[1]) / steps,
      b: (nextColor[2] - color[2]) / steps,
    };

    for (let a = 0; a < steps; a++) {
      rainbow.colors.push(
        Math.min(Math.max(color[0] + Math.round(stepSize.r * a), 0), 255),
        Math.min(Math.max(color[1] + Math.round(stepSize.g * a), 0), 255),
        Math.min(Math.max(color[2] + Math.round(stepSize.b * a), 0), 255)
      );
    }
  });

  process.memory();
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

function hexToRGB(hex) {
  if (hex[0] === "#") {
    hex = hex.slice(1, hex.length);
  }

  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
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
  pixelColours.map((pixelColours) => adjustBrightness(pixel, brightness));
  neopixel.write(config.pixelPin, data);
}

function adjustBrightness(i, brightness) {
  return Math.round((i / 100) * brightness);
}

function fadeCascade() {
  ledInterval = setInterval(() => {
    writePixels(rainbow.colors);
  }, 350);
}

function twinkleCascade() {
  let twinkle = false;

  ledInterval = setInterval(() => {
    const colors = rainbow.getColors();
    if (twinkle) {
      writePixels([].concat(colors.slice(2), colors.slice(0, 2)));
    } else {
      writePixels(colors);
    }
    twinkle = !twinkle;
  }, 350);
}

function fadeBounce() {
  let offset = 0;
  let reverse = false;

  ledInterval = setInterval(() => {
    const colors = rainbow.getColors();
    const data = [].concat(colors.slice(offset), colors.slice(0, offset));
    writePixels(data);

    if (offset === colors.length) {
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
}

function flashOn() {
  const currentState = state.getState();
  let ledOn = false;

  const ledFlash = () => {
    const ledColor =
      currentState.ledColor === "RAINBOW"
        ? rainbow.colors[0]
        : hexToRGB(currentState.ledColor);

    writeAll(ledColor[0], ledColor[1], ledColor[2], config.brightness * ledOn);

    const pauseTime = ledOn ? currentState.onPause : currentState.offPause;

    ledTimeout = setTimeout(ledFlash, pauseTime);

    ledOn = !ledOn;
  };

  ledTimeout = setTimeout(ledFlash, currentState.offPause);
}

const ledPatterns = {
  on: () => {
    if (state.ledColor === "RAINBOW") {
      state.rainbowOffset = 0;
      state.ledInterval = setInterval(() => {
        writeAll(
          rainbow.colors[state.rainbowOffset + 0],
          rainbow.colors[state.rainbowOffset + 1],
          rainbow.colors[state.rainbowOffset + 2]
        );
        state.rainbowOffset = (state.rainbowOffset + 3) % rainbow.colors.length;
      }, 350);
    } else {
      const ledColor = hexToRGB(state.ledColor);
      writeAll(ledColor[0], ledColor[1], ledColor[2]);
    }
  },
  off: () => {
    writeAll(0, 0, 0);
  },
  fadeOn: () => {
    let fadeIn = true;
    let fading = true;
    let brightnessModifier = 0;

    const fadeLED = () => {
      if (
        (brightnessModifier.toFixed(1) == "0.0" && fadeIn === false) ||
        (brightnessModifier.toFixed(1) === "1.0" && fadeIn === true)
      ) {
        fading = false;
        fadeIn = !fadeIn;

        const pauseTime = fadeIn ? state.offPause : state.onPause;

        ledTimeout = setTimeout(() => {
          fading = true;
        }, pauseTime);
        return;
      }

      if (fading) {
        brightnessModifier = fadeIn
          ? brightnessModifier + 0.1
          : brightnessModifier - 0.1;
      }

      const ledColor =
        state.ledColor === "RAINBOW"
          ? rainbow.colors[0]
          : hexToRGB(state.ledColor);

      writeAll(
        ledColor[0],
        ledColor[1],
        ledColor[2],
        config.brightness * brightnessModifier
      );
    };

    state.ledInterval = setInterval(fadeLED, 350);
  },
  fadeCascade: () => {},
  fadeBounce: () => {},
  flashOn: () => {},
  twinkleCascade: () => {},
};

const updateLights = throttle(() => {
  if (state.ledInterval) {
    clearInterval(state.ledInterval);
    state.ledInterval = 0;
  }

  if (state.ledTimeout) {
    clearTimeout(state.ledTimeout);
    state.ledTimeout = 0;
  }

  if (state.ledStatus === "ON") {
    on();
  } else if (state.ledStatus === "OFF") {
    writeAll(0, 0, 0);
  } else if (state.ledStatus === "FADE_CASCADE") {
    fadeCascade();
  } else if (state.ledStatus === "TWINKLE_CASCADE") {
    twinkleCascade();
  } else if (state.ledStatus === "FADE_BOUNCE") {
    fadeBounce();
  } else if (state.ledStatus === "FADE_ON") {
    fadeOn();
  } else if (state.ledStatus === "FLASH_ON") {
    flashOn();
  }
}, 1000);

setup();

const mqtt = MQTT.create(config.mqtt.broker, {
  username: config.mqtt.username,
  password: config.mqtt.password,
  keep_alive: 10,
});

mqtt.on("connected", function () {
  console.log("Connected to MQTT");

  mqtt.subscribe("status");
  mqtt.subscribe("pong");

  if (ledInterval) {
    clearInterval(ledInterval);
    ledInterval = undefined;
  }

  if (ledTimeout) {
    clearTimeout(ledTimeout);
    ledTimeout = undefined;
  }

  twinkleCascade();

  state.pingInterval = setInterval(() => {
    mqtt.publish(config.mqtt.topics.ping, "ping", {
      qos: 1,
      retain: false,
      dup: false,
    });
  }, 5000);
});

mqtt.on("publish", function (pub) {
  if (pub.topic === config.mqtt.topics.status) {
    state.ledStatus = action.data.state;
    state.ledReverse = action.data.reverse || false;
    state.ledColor = action.data.color || "ffffff";
    state.onPause = Math.min(
      Math.max(parseInt(action.data.onPause, 10) || config.onPause, 200),
      2000
    );
    state.offPause = Math.min(
      Math.max(parseInt(action.data.offPause, 10) || config.offPause, 200),
      2000
    );

    updateLights();
  }
});

mqtt.on("disconnected", function () {
  console.log("MQTT disconnected");
  clearInterval(pingInterval);
  setTimeout(function () {
    console.log("Cycling Wifi");
    WiFi.disconnect();
  }, 2500);
});

function connectWifi() {
  WiFi.connect(config.wifi.ssid, {
    password: config.wifi.key,
  });
}
connectWifi();

WiFi.on("connected", () => {
  console.log("Connected to wifi");
  mqtt.connect();
});

WiFi.on("disconnected", () => {
  console.log("Wifi disconnected");
  setTimeout(function () {
    console.log("Reconnecting Wifi");
    connectWifi();
  }, 2500);
});

WiFi.stopAP();
writeAll(0, 0, 0);
