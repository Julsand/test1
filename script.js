// Mobile menu
var navToggle = document.querySelector('.nav-toggle');
var navLinks = document.getElementById('nav-links');

navToggle.addEventListener('click', function () {
  var open = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

// Close the menu after choosing a link
navLinks.addEventListener('click', function (event) {
  if (event.target.tagName === 'A') {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

// Show / hide the session plan
var planToggle = document.getElementById('plan-toggle');
var planList = document.getElementById('plan-list');

planToggle.addEventListener('click', function () {
  var show = planList.hidden;
  planList.hidden = !show;
  planToggle.setAttribute('aria-expanded', show);
  planToggle.textContent = show ? 'Hide session plan' : 'Show session plan';
});

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();
