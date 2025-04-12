const platform = process.platform;
const path = require("path");

const blocksworldSteamAppId = "642390";

function homePath() {
  const os = require("os");
  if (os.homedir) return os.homedir();

  if (platform == "win32") return path.resolve(process.env.USERPROFILE);
  else return path.resolve(process.env.HOME);
}

function steamDataPath() {
  if (platform == "win32") return path.resolve("C:/Program Files (x86)/Steam");
  else
    //return path.resolve(homePath() + "/.local/share/steam");
    return path.resolve("/media/randy/Données/home/randy/steam/");
}

function appDataPath() {
  if (platform == "win32") return path.resolve(process.env.APPDATA);
  else if (platform == "darwin")
    return path.resolve(path.join(homePath(), "Library/Application Support/"));
  else
    return process.env.XDG_CONFIG_HOME
      ? process.env.XDG_CONFIG_HOME
      : path.resolve(path.join(homePath(), ".config/"));
}

function bwDocumentsPath() {
  if (platform == "win32" || true) {
    return path.resolve(homePath() + "/Documents/blocksworld_develop");
  } else {
    const username = homePath().split(path.sep)[2];
    return path.join(
      appDataPath(),
      "Blocksworld Launcher/.wine/drive_c/users/" +
        username +
        "/Documents/blocksworld_develop",
    );
  }
}

function bwUserPath() {
  return path.resolve(bwDocumentsPath() + "/user_1000"); // TODO: auto-detect
}

export {
  homePath,
  steamDataPath,
  appDataPath,
  bwDocumentsPath,
  bwUserPath,
  blocksworldSteamAppId,
};
