import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import "./styles/index.css";         
import App from "./App.jsx";
import { TagsProvider } from "./context/TagsContext.jsx";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TagsProvider>
      <App />
    </TagsProvider>
  </StrictMode>,
)
