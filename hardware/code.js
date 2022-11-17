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
  rainbowBaseColors: [
    [255, 0, 0],
    [255, 255, 0],
    [0, 255, 0],
    [0, 255, 255],
    [0, 0, 255],
    [255, 0, 255],
  ],
};

const state = {
  ledStatus: "OFF",
  ledColor: [255, 255, 255],
  offPause: config.offPause,
  onPause: config.onPause,
  ledInterval: 0,
  ledTimeout: 0,
  pingInterval: 0,
  rainbow: [],
};

function generateRainbow() {
  const steps = Math.ceil(config.numPixels / rainbow.baseColors.length);

  rainbow.baseColors.forEach((color, i) => {
    const nextColor = rainbow.baseColors[(i + 1) % rainbow.baseColors.length];
    const stepSize = {
      r: (nextColor[0] - color[0]) / steps,
      g: (nextColor[1] - color[1]) / steps,
      b: (nextColor[2] - color[2]) / steps,
    };

    for (let a = 0; a < steps; a++) {
      state.rainbow.push(
        Math.min(Math.max(color[0] + Math.round(stepSize.r * a), 0), 255),
        Math.min(Math.max(color[1] + Math.round(stepSize.g * a), 0), 255),
        Math.min(Math.max(color[2] + Math.round(stepSize.b * a), 0), 255)
      );
    }
  });
}

function updateRainbow(reverse) {
  if (reverse) {
    return Array.prototype.unshift.apply(
      state.rainbow,
      state.rainbow.splice(-3, 3)
    );
  }

  return Array.prototype.push.apply(state.rainbow, state.rainbow.splice(0, 3));
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

const ledPatterns = {
  on: () => {
    if (state.ledColor === "RAINBOW") {
      state.ledInterval = setInterval(() => {
        writeAll(state.rainbow[0], state.rainbow[1], state.rainbow[2]);
        updateRainbow();
      }, 350);
    } else {
      writeAll(state.ledColor[0], state.ledColor[1], state.ledColor[2]);
    }
  },
  off: () => {
    writeAll(0, 0, 0);
  },
  cascade: () => {
    ledInterval = setInterval(() => {
      writePixels(rainbow.colors);
      updateRainbow();
    }, 350);
  },
  bounce: () => {
    let offset = 0;
    let reverse = false;

    ledInterval = setInterval(() => {
      writePixels(state.rainbow);

      if (offset === state.rainbow.length - 1) {
        reverse = true;
      } else if (offset === 0) {
        reverse = false;
      }

      offset = reverse ? offset - 3 : offset + 3;

      updateRainbow(reverse);
    }, 350);
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

        ledTimeout = setTimeout(
          () => {
            fading = true;
          },
          fadeIn ? state.offPause : state.onPause
        );
        return;
      }

      if (fading) {
        brightnessModifier = fadeIn
          ? brightnessModifier + 0.1
          : brightnessModifier - 0.1;
      }

      if (state.ledColor === "RAINBOW") {
        writeAll(
          state.rainbow[0],
          state.rainbow[1],
          state.rainbow[2],
          config.brightness * brightnessModifier
        );
        updateRainbow();
      } else {
        writeAll(
          state.ledColor[0],
          state.ledColor[1],
          state.ledColor[2],
          config.brightness * brightnessModifier
        );
      }
    };

    state.ledInterval = setInterval(fadeLED, 350);
  },
  flashOn: () => {
    let ledOn = false;

    const ledFlash = () => {
      if (ledOn) {
        if (state.ledColor === "RAINBOW") {
          writeAll(state.rainbow[0], state.rainbow[1], state.rainbow[2]);
          updateRainbow();
        } else {
          writeAll(state.ledColor[0], state.ledColor[1], state.ledColor[2]);
        }
      } else {
        writeAll(0, 0, 0);
      }

      ledTimeout = setTimeout(ledFlash, ledOn ? state.onPause : state.offPause);

      ledOn = !ledOn;
    };

    ledTimeout = setTimeout(ledFlash, state.offPause);
  },
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
    ledPatterns.on();
  } else if (state.ledStatus === "OFF") {
    ledPatterns.off();
  } else if (state.ledStatus === "CASCADE") {
    ledPatterns.cascade();
  } else if (state.ledStatus === "BOUNCE") {
    ledPatterns.bounce();
  } else if (state.ledStatus === "FADE_ON") {
    ledPatterns.fadeOn();
  } else if (state.ledStatus === "FLASH_ON") {
    ledPatterns.flashOn();
  }
}, 1000);

writeAll(0, 0, 0);
generateRainbow();
process.memory();

const mqtt = MQTT.create(config.mqtt.broker, {
  username: config.mqtt.username,
  password: config.mqtt.password,
  keep_alive: 10,
});

mqtt.on("connected", function () {
  console.log("Connected to MQTT");

  mqtt.subscribe(config.mqtt.topics.status);

  state.ledStatus = "CASCADE";

  updateLights();

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
    const message = JSON.parse(pub.message);
    state.ledStatus = message.state;
    state.ledColor =
      message.color === "RAINBOW" ? "RAINBOW" : hexToRGB(message.color);
    state.onPause = Math.min(
      Math.max(parseInt(message.onPause, 10) || config.onPause, 200),
      2000
    );
    state.offPause = Math.min(
      Math.max(parseInt(message.offPause, 10) || config.offPause, 200),
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
