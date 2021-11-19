const { ipcRenderer } = require("electron");

window.onregisterdone = function() {
	ipcRenderer.send("close-register-window");
};
