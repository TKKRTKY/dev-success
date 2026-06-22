import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { agentAdapter } from './adapters'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App agentAdapter={agentAdapter} />
  </StrictMode>,
)
