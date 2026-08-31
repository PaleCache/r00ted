document.addEventListener('DOMContentLoaded', () => {
  const channelDrawer = document.querySelector('.sidebar2');
  const usersDrawer = document.getElementById('usersList');
  const backdrop = document.getElementById('mobileBackdrop');
  const openChannelsBtn = document.getElementById('openChannelsBtn');
  const openUsersBtn = document.getElementById('openUsersBtn');

  function openDrawer(el) {
    el.classList.add('open');
    backdrop.classList.add('show');
  }

  function closeDrawers() {
    channelDrawer.classList.remove('open');
    usersDrawer.classList.remove('open');
    backdrop.classList.remove('show');
  }

  openChannelsBtn.addEventListener('click', () => openDrawer(channelDrawer));
  openUsersBtn.addEventListener('click', () => openDrawer(usersDrawer));
  backdrop.addEventListener('click', closeDrawers);
  document.getElementById('channelsList')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) closeDrawers();
  });
});