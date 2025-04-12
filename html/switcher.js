function switchTo(id) {
	for (const element of document.getElementsByClassName("content")) {
		element.style.display = "none";
	}
	for (const element of document.getElementsByClassName("nav-item")) {
		element.classList.remove("active");
	}
	document.getElementById(id + "-content").style.display = "flex";
	const link = document.getElementById(id + "-link");
	if (link != null) {
		link.classList.add("active");
	}
	if (id == "index") {
		document.querySelector("#index-iframe").src = "https://bwsecondary.ddns.net/news";
	}
}

function isActivated(id) {
	return document.getElementById(id + "-content").style.display == "flex";
}

switchTo("index");
