// layout.js — sidebar y topbar compartidos entre todas las páginas

const NAV_ITEMS = [
  { href: 'dashboard.html',    icon: '📊', label: 'Dashboard',    roles: ['admin','gerente','supervisor','mesero'] },
  { href: 'metricas.html',     icon: '📈', label: 'Métricas',     roles: ['admin','gerente','supervisor','mesero'] },
  { href: 'incentivos.html',   icon: '🏆', label: 'Incentivos',   roles: ['admin','gerente','supervisor','mesero'] },
  { href: 'reportes.html',     icon: '📂', label: 'Reportes',     roles: ['admin','gerente','supervisor'] },
  { href: 'usuarios.html',     icon: '👥', label: 'Usuarios',     roles: ['admin','gerente'] },
  { href: 'restaurantes.html', icon: '🏪', label: 'Restaurantes', roles: ['admin'] },
  { href: 'avisos.html',       icon: '🔔', label: 'Avisos',       roles: ['admin','gerente','supervisor','mesero'], badge: true },
]

async function renderLayout(activePage) {
  const user = Auth.require()
  if (!user) return

  const restaurants = await DB.getRestaurants()
  const unread = user.restaurant_id
    ? await DB.getUnreadCount(user.id, user.restaurant_id)
    : 0

  // Restaurante activo en sesión
  let activeRestaurant = sessionStorage.getItem('active_restaurant')
  if (!activeRestaurant && restaurants.length > 0) {
    activeRestaurant = user.restaurant_id || restaurants[0].id
    sessionStorage.setItem('active_restaurant', activeRestaurant)
  }

  const activeRestaurantData = restaurants.find(r => r.id === activeRestaurant)

  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()

  const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(user.role))

  const navHTML = filteredNav.map(item => {
    const isActive = activePage === item.href
    const badgeHTML = item.badge && unread > 0
      ? `<span class="nav-badge">${unread}</span>`
      : ''
    return `
      <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}">
        <span class="nav-icon">${item.icon}</span>
        ${item.label}
        ${badgeHTML}
      </a>`
  }).join('')

  const restaurantOptions = restaurants.map(r =>
    `<option value="${r.id}" ${r.id === activeRestaurant ? 'selected' : ''}>${r.name}</option>`
  ).join('')

  const selectorHTML = user.role === 'admin' || user.role === 'gerente'
    ? `<div class="sidebar-restaurant-selector">
        <span style="font-size:14px">🏪</span>
        <select onchange="changeRestaurant(this.value)" id="restaurant-select">
          ${restaurantOptions}
        </select>
       </div>`
    : `<div class="sidebar-restaurant-selector" style="cursor:default">
        <span style="font-size:14px">🏪</span>
        <span style="font-size:12px;font-weight:500;color:#fff">${activeRestaurantData?.name || 'Mi restaurante'}</span>
       </div>`

  const sidebarHTML = `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="sidebar-logo-icon">🍽️</div>
        <div>
          <div class="sidebar-logo-text">RestaurantOS</div>
          <div class="sidebar-logo-sub">Métricas de Ventas</div>
        </div>
      </div>

      ${selectorHTML}

      <nav class="sidebar-nav">
        <div class="nav-section-label">Menú principal</div>
        ${navHTML}
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-user" onclick="confirmLogout()">
          <div class="avatar">${initials}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${user.name}</div>
            <div class="sidebar-user-role">${user.role}</div>
          </div>
          <span style="color:rgba(255,255,255,0.3);font-size:13px">⏻</span>
        </div>
      </div>
    </aside>`

  document.getElementById('sidebar-placeholder').innerHTML = sidebarHTML
}

function changeRestaurant(id) {
  sessionStorage.setItem('active_restaurant', id)
  window.location.reload()
}

function getActiveRestaurant() {
  return sessionStorage.getItem('active_restaurant')
}

function confirmLogout() {
  if (confirm('¿Cerrar sesión?')) Auth.logout()
}

function showModal(id) {
  document.getElementById(id).classList.add('open')
}

function hideModal(id) {
  document.getElementById(id).classList.remove('open')
}

function toast(msg, type = 'success') {
  const t = document.createElement('div')
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${type === 'success' ? '#1A1916' : '#C0392B'};
    color:#fff;padding:12px 18px;border-radius:10px;
    font-size:13.5px;font-weight:500;font-family:'DM Sans',sans-serif;
    box-shadow:0 4px 20px rgba(0,0,0,0.2);
    animation:slideUp 0.2s ease;
  `
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3000)
}

// CSS for toast animation
const style = document.createElement('style')
style.textContent = `@keyframes slideUp { from { transform:translateY(10px);opacity:0 } to { transform:translateY(0);opacity:1 } }`
document.head.appendChild(style)
