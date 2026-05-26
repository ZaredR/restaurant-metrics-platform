import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

/* ── Global styles (import order matters) ── */
import './styles/variables.css'
import './styles/reset.css'
import './styles/global.css'
import './styles/components.css'
import './styles/animations.css'
import './styles/sidebar.css'
import './styles/auth.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
