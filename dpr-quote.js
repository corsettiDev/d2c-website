if (document.currentScript.parentElement) {
  const name = document.currentScript.parentElement.getAttribute("data-script");

  console.log(`Hello, ${name}!`);
  console.log(patrick);
}
