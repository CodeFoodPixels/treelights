const neopixel = require("neopixel");
const WiFi = require("Wifi");
const MQTT = require("tinyMQTT");

const config = {
  wifi: {
    ssid: "",
    key: "",
  },
  mqtt: {
    broker: "home.lukeb.co.uk",
    username: "public",
    password: "public",
    topics: {
      ping: "public/tree/ping",
      status: "public/tree/status",
    },
  },
  pixelPin: NodeMCU.D3,
  numPixels: 250,
  brightness: 20,
  updateTime: 50,
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
  const steps = Math.ceil(config.numPixels / config.rainbowBaseColors.length);
  config.rainbowBaseColors.forEach((color, i) => {
    const nextColor =
      config.rainbowBaseColors[(i + 1) % config.rainbowBaseColors.length];
    const stepSize = {
      r: (nextColor[0] - color[0]) / steps,
      g: (nextColor[1] - color[1]) / steps,
      b: (nextColor[2] - color[2]) / steps,
    };
    for (let a = 0; a < steps; a++) {
      state.rainbow.push(
        color[0] + Math.round(stepSize.r * a),
        color[1] + Math.round(stepSize.g * a),
        color[2] + Math.round(stepSize.b * a)
      );
    }
  });
}

function updateRainbow(reverse) {
  if (reverse) {
    const colors = state.rainbow.splice(-3, 3);
    return state.rainbow.unshift(colors[0], colors[1], colors[2]);
  }

  const colors = state.rainbow.splice(0, 3);
  return state.rainbow.push(colors[0], colors[1], colors[2]);
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
  const data = [
    adjustBrightness(g, brightness),
    adjustBrightness(r, brightness),
    adjustBrightness(b, brightness),
  ];
  for (let i = 1; i < config.numPixels; i++) {
    data.push(data[0], data[1], data[2]);
  }
  neopixel.write(config.pixelPin, data);
}

function writePixels(pixelColours, brightness) {
  if (brightness === undefined) {
    brightness = config.brightness;
  }

  neopixel.write(
    config.pixelPin,
    pixelColours.map((pixel) => adjustBrightness(pixel, brightness))
  );
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
      }, config.updateTime);
    } else {
      writeAll(state.ledColor[0], state.ledColor[1], state.ledColor[2]);
    }
  },
  off: () => {
    writeAll(0, 0, 0);
  },
  cascade: () => {
    state.ledInterval = setInterval(() => {
      writePixels(state.rainbow);
      updateRainbow();
    }, config.updateTime);
  },
  bounce: () => {
    let offset = 0;
    let reverse = false;

    state.ledInterval = setInterval(() => {
      writePixels(state.rainbow);

      if (offset === state.rainbow.length - 1) {
        reverse = true;
      } else if (offset === 0) {
        reverse = false;
      }

      offset = reverse ? offset - 3 : offset + 3;

      updateRainbow(reverse);
    }, config.updateTime);
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

    state.ledInterval = setInterval(fadeLED, config.updateTime);
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

      state.ledTimeout = setTimeout(
        ledFlash,
        ledOn ? state.onPause : state.offPause
      );

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
});

mqtt.on("connected", function () {
  console.log("Connected to MQTT");

  mqtt.subscribe(config.mqtt.topics.status);

  state.ledStatus = "CASCADE";

  updateLights();

  state.pingInterval = setInterval(() => {
    mqtt.publish(config.mqtt.topics.ping, "ping");
  }, 5000);
});

mqtt.on("message", function (pub) {
  if (pub.topic === config.mqtt.topics.status) {
    const message = pub.message.split(",");
    console.log(message);
    state.ledStatus = message[0];
    state.ledColor =
      message[1] === "RAINBOW" ? "RAINBOW" : hexToRGB(message[1]);
    state.onPause = Math.min(
      Math.max(parseInt(message[2], 10) || config.onPause, 200),
      2000
    );
    state.offPause = Math.min(
      Math.max(parseInt(message[3], 10) || config.offPause, 200),
      2000
    );

    updateLights();
  }
});

mqtt.on("disconnected", function () {
  console.log("MQTT disconnected");
  clearInterval(state.pingInterval);
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
