/**
	Blocksworld Launcher
    Copyright (C) 2021 zenith391

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

const fs = require("fs");
const path = require("path");
const https = require("https");
const extract = require("extract-zip");
const querystring = require("querystring");
const child_process = require("child_process");
const { ipcRenderer, shell } = require("electron");
import {
  steamDataPath,
  appDataPath,
  bwDocumentsPath,
  blocksworldSteamAppId,
  bwUserPath,
} from "./utils.js";
import { createApp } from "./js/vue.esm-browser.js";
import { animate, utils, createSpring } from "./js/anime.esm.min.js";

const platform = process.platform;
let launchPlatform = "self";
let currentMod = null;

const steamPath = steamDataPath();
const steamBlocksworldPath = steamPath + "/steamapps/common/Blocksworld";
const bwPath = appDataPath() + "/Blocksworld Launcher";

class ModManager {
  constructor() {
    this.installedMods = { mods: [] };
  }

  async load() {
    if (fs.existsSync(bwPath + "/mods.json")) {
      this.installedMods = JSON.parse(fs.readFileSync(bwPath + "/mods.json"));
    } else {
      this.installedMods = { mods: [] };
    }
  }

  async save() {
    // TODO
    fs.writeFileSync(bwPath + "/mods.json", JSON.stringify(this.installedMods));
  }

  getMod(id, version) {
    for (const mod of this.installedMods.mods) {
      if (mod.id == id) {
        return mod;
      }
    }
    return null;
  }

  setMod(id, newMod) {
    let replaced = false;
    for (const key in this.installedMods.mods) {
      const mod = this.installedMods.mods[key];
      if (mod.id == id) {
        this.installedMods.mods[key] = newMod;
        replaced = true;
      }
    }
    if (!replaced) {
      this.installedMods.mods.push(newMod);
    }
  }

  async downloadMod(modId, version) {
    const url =
      "https://bwsecondary.ddns.net/download.php?mod=" +
      modId +
      "&version=" +
      version;
    const modResp = await fetch(
      "https://bwsecondary.ddns.net/api/mods/" + modId,
    );
    const mod = await modResp.json();
    console.log(mod);

    let installPath = "";
    if (mod["install_method"] == 0) {
      installPath = bwPath + "/Blocksworld/Blocksworld_Data/Managed";
    } else {
      if (mod["install_method"] == 1) {
        // C# mod
        installPath = bwUserPath() + "/user/mods/";
      } else if (mod["install_method"] == 2) {
        // Lua mod
        installPath = bwUserPath() + "/user/lua_mods/";
      } else {
        alert(
          "Please wait for a future version of Blocksworld Launcher to install this type of mod !",
        );
        return;
      }
      console.log("Installation path: " + installPath);
    }

    document.getElementById("downloaded-text").innerText =
      "Downloading " + mod.name + ", please wait..";
    $("#downloadModal").modal();
    https.get(url, function (res) {
      let length = parseInt(res.headers["content-length"]);
      if (length === undefined || isNaN(length)) length = 1;

      let out = fs.createWriteStream(bwPath + "/download.zip");
      let progressBar = document.getElementById("download-progress");
      let downloaded = 0;

      res.on("data", async function (data) {
        out.write(data);
        downloaded += data.length;
        requestAnimationFrame(function () {
          var percent = (downloaded / length) * 100;
          ipcRenderer.send("update-download", percent);
          progressBar.style.width = Math.floor(percent) + "%";
          progressBar.innerText =
            Math.floor(downloaded / 1024) +
            "KiB / " +
            Math.floor(length / 1024) +
            "KiB";
        });
      });

      res.on("end", function () {
        ipcRenderer.send("update-done");
        out.uncork();
        out.end();
        (async function () {
          document.getElementById("downloaded-text").innerText =
            "Installing " + mod.name + ", please wait..";
          await extract(bwPath + "/download.zip", {
            dir: installPath,
            onEntry: function (entry, zipFile) {
              progressBar.innerText = entry.fileName;
            },
          });
          let modJson = mod;
          modJson.id = parseInt(modId);
          modJson.version = version;

          modManager.setMod(modJson.id, modJson);
          await modManager.save();
          loadMod(modId);
          fs.unlinkSync(bwPath + "/download.zip");
          setTimeout(function () {
            $("#downloadModal").modal("hide");
          }, 500);
        })();
      });
    });
  }
}

let modManager = new ModManager();
await modManager.load();

let userAuthToken = null;
let loginCallback = null;

// Utilities
String.prototype.format = function () {
  let result = this;
  for (let k in arguments) {
    result = result.replace(new RegExp("\\{" + k + "\\}", "g"), arguments[k]);
  }
  return result;
};

// Back-End
function launchBlocksworldSteam() {
  shell
    .openExternal("steam://rungameid/" + blocksworldSteamAppId)
    .then(function () {
      $("#steamLaunchingModal").modal();
      setTimeout(function () {
        $("#steamLaunchingModal").modal("hide");
      }, 10000);
    });
}
global.launchBlocksworldSteam = launchBlocksworldSteam;

const blocksworldDownload =
  "https://bwsecondary.ddns.net/uploads/Blocksworld.zip";
function launchBlocksworld() {
  if (launchPlatform == "steam") {
    launchBlocksworldSteam();
  } else if (launchPlatform == "self-download") {
    if (platform == "darwin") {
      alert(
        "Sorry! For now the self launching only works on Windows and Linux!",
      );
    } else {
      https.get(blocksworldDownload, function (res) {
        document.getElementById("downloaded-text").innerText =
          "Downloading Blocksworld, please wait..";
        $("#downloadModal").modal();
        const length = parseInt(res.headers["content-length"]);
        fs.mkdirSync(bwPath, { recursive: true });
        var out = fs.createWriteStream(bwPath + "/download.zip");
        var progressBar = document.getElementById("download-progress");
        var downloaded = 0;

        res.on("data", async function (data) {
          out.write(data);
          downloaded += data.length;
          requestAnimationFrame(function () {
            const percent = (downloaded / length) * 100;
            ipcRenderer.send("update-download", percent);
            progressBar.style.width = percent + "%";
            progressBar.innerText =
              Math.floor(downloaded / 1024 / 1024) +
              "MiB / " +
              Math.floor(length / 1024 / 1024) +
              "MiB";
          });

          if (downloaded == length) {
            out.end();
            await extract(bwPath + "/download.zip", {
              dir: bwPath,
              onEntry: function (entry, zipFile) {
                progressBar.innerText = "Unpacking " + entry.fileName + "..";
              },
            });
            fs.unlinkSync(bwPath + "/download.zip");
            let modJson = {
              id: 0,
              version: "0.4.1",
            };
            modManager.setMod(0, modJson);
            if (currentMod && currentMod.id == 0) loadMod(0);
            await modManager.save();
            $("#downloadModal").modal("hide");
            document.getElementById("player").innerText =
              "Launching via account";
            document.getElementById("play-button").innerText = "Play";
            launchPlatform = "self";
            launchBlocksworld();
          }
        });
      });
    }
  } else if (launchPlatform == "self") {
    let hasExdilin = false;
    {
      const exdilinMod = modManager.getMod(0);
      if (exdilinMod.version != "0.4.1") {
        hasExdilin = true;
      }
    }
    if (!hasExdilin) {
      alert("You need Exdilin in order to play Blocksworld!");
      switchTo("add-mod");
      loadMod(0);
      return;
    }

    if (userAuthToken == null) {
      openLoginModal(launchBlocksworld);
    } else {
      fs.writeFileSync(
        bwPath + "/Blocksworld/auth_token.txt",
        userAuthToken.toString(),
      );
      if (platform == "win32") {
        $("#standaloneLaunching").modal();
        shell
          .openPath(bwPath + "/Blocksworld/Blocksworld.exe")
          .then(function (err) {
            $("#standaloneLaunching").modal("hide");
            if (err !== "" && err !== undefined && err !== null) {
              shell.beep();
              alert("Error: " + err);
            }
          });
      } else if (platform == "linux") {
        $("#standaloneLaunching").modal();
        setTimeout(() => {
          $("#standaloneLaunching").modal("hide");
        }, 10000);
        child_process.exec(
          'nohup wine "' + bwPath + '/Blocksworld/Blocksworld.exe"',
          {
            env: Object.assign(
              {
                WINEPREFIX: bwPath + "/.wine",
              },
              process.env,
            ),
          },
          function (err) {
            if (err !== "" && err !== undefined && err !== null) {
              shell.beep();
              alert("Error: " + err);
            }
          },
        );
      } else {
        alert(
          "Sorry! For now the self launching only works on Windows and Linux!",
        );
      }
    }
  }
}
global.launchBlocksworld = launchBlocksworld;

const serverPath = "https://bwsecondary.ddns.net:8080";
function apiPost(path, post, callback) {
  const postData = querystring.stringify(post);
  console.log("API request: " + path);
  console.log("post data:");
  console.log(post);
  const req = https.request(
    {
      hostname: "bwsecondary.ddns.net",
      port: 8080,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    },
    function (res) {
      res.setEncoding("utf8");
      let data = "";
      res.on("data", function (chunk) {
        data += chunk;
      });
      res.on("end", function () {
        console.log(JSON.parse(data));
        callback(null, JSON.parse(data));
      });
    },
  );
  req.write(postData);
  req.end();
}

function apiGet(path, callback) {
  console.log("API request: " + path);
  fetch(serverPath + path, { cache: "no-cache" }).then((response) => {
    response
      .json()
      .then((json) => {
        console.log(json);
        callback(null, json);
      })
      .catch((err) => {
        console.log(err);
        callback(err, null);
      });
  });
}

function logout() {
  localStorage.removeItem("authToken");
  document.getElementById("login-button").style.display = "inline";
  document.getElementById("logout-button").style.display = "none";
  document.getElementById("current-account").innerHTML = "";
}
global.logout = logout;

function initAccountButton(username) {
  document.getElementById("login-button").style.display = "none";
  document.getElementById("logout-button").style.display = "inline";
  document.getElementById("current-account").innerHTML =
    '<a href="#account">' + username + "</a>";
}

function login() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  let hash = require("crypto").createHash("sha256");
  hash.update(password, "utf8");
  const digest = hash.digest("base64");

  apiPost(
    "/api/v2/account/login",
    {
      username: username,
      password: digest,
    },
    function (err, json) {
      if (json.error) {
        if (json.error_details === "link_account") {
          $("#loginModal").modal("hide");
          $("#createBw2").modal();
        } else {
          document.getElementById("login-error-alert").style.display = "block";
          document.getElementById("login-error").innerText =
            "Error: " + json.error_msg;
        }
      } else {
        userAuthToken = json.auth_token;
        $("#loginModal").modal("hide");
        initAccountButton(username);
        const rememberMe = document.getElementById("remember-me").checked;
        if (rememberMe) {
          localStorage.setItem("authToken", json.auth_token);
          console.log("set cookie");
        }
        if (loginCallback != null) {
          loginCallback();
        }
      }
    },
  );
}
global.login = login;

function createBw2Account() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  let hash = require("crypto").createHash("sha256");
  hash.update(password, "utf8");
  const digest = hash.digest("base64");

  apiPost(
    "/api/v2/account/link",
    {
      username: username,
      password: digest,
    },
    function (err, json) {
      $("#createBw2").modal("hide");
      if (json.error) {
        document.getElementById("login-error").innerText =
          "Error: " + json.error_msg;
        $("#loginModal").modal();
        alert(json.error_msg);
      } else {
        userAuthToken = json.auth_token;
        initAccountButton(username);
      }
    },
  );
}
global.createBw2Account = createBw2Account;

// Front-End

function openLoginModal(cb) {
  if (cb === undefined) cb = null;
  loginCallback = cb;
  document.getElementById("login-error-alert").style.display = "none";
  document.getElementById("login-error").innerText = "";
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
  $("#loginModal").modal();
}
global.openLoginModal = openLoginModal;

function openRegisterWindow() {
  ipcRenderer.send("open-register-window");
}
global.openRegisterWindow = openRegisterWindow;

const modText = {
  notInstalled: "You have not installed {0} yet.",
  outdatedVersion:
    "An outdated version of {0} is installed ({1}). Please update to the latest version ({2}).",
  updatedVersion: "The latest version of {0} is installed.",
};

async function loadMod(id) {
  currentMod = id;
  const actives = document.getElementsByClassName("active");
  if (actives.length > 0) actives[0].classList.remove("active");
  document.getElementById("mod-item-" + id).classList.add("active");

  const iframe = document.querySelector("#mod-frame");
  iframe.src = "https://bwsecondary.ddns.net/mods/" + id;
  iframe.onload = () => {
    iframe.contentWindow.postMessage("embedded", "*");
  };
}
global.loadMod = loadMod;

async function loadMods() {
  let response = await fetch("https://bwsecondary.ddns.net/api/mods/list");
  if (response.ok) {
    let json = await response.json();
    let list = document.getElementById("mod-list");
    for (const mod of json.mods) {
      let pill = document.createElement("span");
      let pillText = document.createTextNode(mod.downloads.toString());
      pill.classList.add("badge");
      pill.classList.add("badge-primary");
      pill.classList.add("badge-pill");
      pill.classList.add("float-right");
      pill.appendChild(pillText);

      let element = document.createElement("a");
      let elementText = document.createElement("span");
      elementText.innerHTML = mod.name; // the name is sanitized server-side

      element.appendChild(elementText);
      element.appendChild(pill);
      element.href = "javascript:loadMod(" + mod.id + ")";
      element.id = "mod-item-" + mod.id;
      element.classList.add("list-group-item");
      element.classList.add("list-group-item-action");
      list.appendChild(element);
    }
  } else {
    // TODO: handle error
  }
}

async function loadMyMods() {
  const app = createApp({
    data() {
      return {
        mods: modManager.installedMods.mods,
      };
    },
    methods: {
      reloadMods() {
        this.mods = modManager.installedMods.mods;
        this.$forceUpdate();
      },
    },
  }).mount("#my-mods-list");
  setInterval(() => {
    app.reloadMods();
  }, 1000);
}
loadMyMods();

window.addEventListener("DOMContentLoaded", function () {
  if (fs.existsSync(steamBlocksworldPath) && false) {
    document.getElementById("player").innerText = "Launch using Steam";
    document.getElementById("steam-button").style.display = "none";
    launchPlatform = "steam";
  } else if (
    !fs.existsSync(bwPath + "/Blocksworld/Blocksworld_Data/Managed") ||
    !fs.existsSync(bwPath + "/Blocksworld/Blocksworld.exe")
  ) {
    //document.getElementById("player").innerText = "";
    document.getElementById("play-button").innerText = "Download and play";
    launchPlatform = "self-download";
  } else {
    //document.getElementById("player").innerText = "Launch using account";
    launchPlatform = "self";
  }
});

// TODO: use @prefers css rules
/*ipcRenderer.on("change-dark-theme", function(event, darkTheme) {
	const content = document.getElementById("index-content");
	const light = document.getElementsByClassName("bg-light");
	const dark = document.getElementsByClassName("bg-dark");
	
	const listItems = document.getElementsByClassName("list-group-item");

	if (darkTheme) {
		content.classList.remove("light-theme");
		content.classList.add("dark-theme");
		for (elem of light) {
			elem.classList.add("bg-dark");
			elem.classList.add("text-white");
		}
		for (elem of listItems) {
			elem.classList.add("bg-dark");
			elem.classList.add("text-white");
		}
	} else {
		content.classList.remove("dark-theme");
		content.classList.add("light-theme");
		for (elem of dark) {
			elem.classList.add("bg-light");
			elem.classList.add("text-black");
		}
		for (elem of listItems) {
			elem.classList.remove("bg-dark");
			elem.classList.remove("text-white");
		}
	}

	for (elem of dark) {
		elem.classList.remove("bg-light");
		elem.classList.remove("text-black");
	}
	for (elem of light) {
		elem.classList.remove("bg-dark");
		elem.classList.remove("text-white");
	}
});*/

window.onmessage = async (e) => {
  const split = e.data.split(",");
  if (split[0] == "download") {
    await modManager.downloadMod(currentMod, split[1]);
  }
};

const lastAuthToken = localStorage.getItem("authToken");
if (lastAuthToken) {
  apiGet(
    "/api/v2/account/validate?auth_token=" + lastAuthToken,
    function (err, json) {
      if (json.validated) {
        userAuthToken = lastAuthToken;
        initAccountButton(json.username);
      } else {
        console.log("Invalidated auth token.");
        localStorage.removeItem("authToken");
      }
    },
  );
}

if (!fs.existsSync(bwPath)) {
  fs.mkdirSync(bwPath);
}

loadMods();

const dateText = document.getElementById("date-text");
const date = new Date();

if (date.getDate() == 25 && date.getMonth() == 11) {
  // 25th December
  dateText.innerText = "Merry Christmas!";
} else if (date.getDate() == 31 && date.getMonth() == 9) {
  // 31st October
  var no = date.getFullYear() - 2019;
  const digit = no >= 10 && no < 20 ? 0 : no % 10;
  const suffix =
    digit == 1 ? "st" : digit == 2 ? "nd" : digit == 3 ? "rd" : "th";
  dateText.innerText =
    "Happy Halloween and happy " + no + suffix + " birthday BW2";
}

// Cosmetics
animate(".navbar-brand", {
  scale: [{ from: 0.9, to: 1, duration: 750, ease: "inOut(3)" }],
  composition: "blend",
  duration: 750,
  alternate: true,
  loop: true,
});

const [$brand] = utils.$(".navbar-brand");
$brand.addEventListener("mouseenter", () =>
  animate($brand, {
    composition: "blend",
    scale: 1.5,
    duration: 350,
  }),
);
$brand.addEventListener("mouseleave", () =>
  animate($brand, {
    composition: "blend",
    scale: 1.0,
    duration: 250,
  }),
);
$brand.addEventListener("click", () =>
  animate($brand, {
    rotate: {
      from: "0turn",
      to: "1turn",
      ease: "inOut(3)",
      duration: 500,
    },
  }),
);
