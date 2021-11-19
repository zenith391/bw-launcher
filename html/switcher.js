function switchTo(id) {
	for (element of document.getElementsByClassName("content")) {
		element.style.display = "none";
	}
	document.getElementById(id + "-content").style.display = "flex";
}

function isActivated(id) {
	return document.getElementById(id + "-content").style.display == "flex";
}

switchTo("index");
