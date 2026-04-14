import React, { useEffect, useState } from 'react'
import { ProviderManifest, ProviderViewState } from '../../shared/contracts'

function App(): JSX.Element {
  const [providers, setProviders] = useState<ProviderManifest[]>([])
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ProviderViewState | null>(null)

  const loadProviders = async () => {
    try {
      const list = await window.glaia.providers.list()
      setProviders(list)
    } catch (err) {
      console.error('Failed to load providers', err)
    }
  }

  useEffect(() => {
    loadProviders()

    const unsubscribe = window.glaia.providerView.onStateChanged((state) => {
      setViewState(state)
    })

    return () => unsubscribe()
  }, [])

  const handleProviderClick = (providerId: string) => {
    window.glaia.providers.open(providerId)
    setActiveProvider(providerId)
    setViewState(null) // Reset state on switch
  }

  const handleAddTestProvider = async () => {
    const testId = `provider-${Date.now()}`
    const testProvider: ProviderManifest = {
      schemaVersion: "1.0",
      id: testId,
      name: `Test Provider ${Math.floor(Math.random() * 1000)}`,
      startUrl: "https://example.com/",
      partition: `persist:provider.${testId}.default`,
      allowPopups: false,
      allowNotifications: false,
      allowClipboardRead: false,
      allowClipboardWrite: true,
      enabled: true
    }
    
    try {
      await window.glaia.providers.create(testProvider)
      await loadProviders()
    } catch (e) {
      console.error('Failed to create test provider', e)
    }
  }

  const handleDeleteProvider = async (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation();
    const confirmed = window.confirm("Sei sicuro di voler eliminare questo provider dal catalogo?");
    if (confirmed) {
      try {
        await window.glaia.providers.delete(providerId);
        if (activeProvider === providerId) {
          setActiveProvider(null);
          // Ricarica senza provider attivo, la view andrà tolta dal Main,
          // ma per ora si ricaricherà l'interfaccia che non mostra i bottoni
        }
        await loadProviders();
      } catch (err) {
        console.error("Failed to delete provider", err);
      }
    }
  }

  const handleExport = async () => {
    const success = await window.glaia.providers.export();
    if (success) {
      alert("Catalogo esportato con successo!");
    }
  }

  const handleImport = async () => {
    const success = await window.glaia.providers.import();
    if (success) {
      await loadProviders();
      alert("Catalogo importato con successo!");
    }
  }

  const handleResetSession = async () => {
    if (!activeProvider) return
    const confirmed = window.confirm("Sei sicuro di voler resettare i dati e la sessione di questo provider? Questa azione è irreversibile.")
    if (confirmed) {
      try {
        await window.glaia.providers.resetSession(activeProvider)
        window.glaia.providerView.reload() // Ricarica dopo il reset
      } catch (e) {
        console.error('Failed to reset session', e)
      }
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', margin: 0, padding: 0 }}>
      <aside style={{ 
        width: '260px', 
        borderRight: '1px solid #ccc', 
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        backgroundColor: '#f0f0f0'
      }}>
        <h2>Glaia</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
           <button onClick={handleImport} style={{ flex: 1, padding: '0.25rem', cursor: 'pointer' }}>Importa</button>
           <button onClick={handleExport} style={{ flex: 1, padding: '0.25rem', cursor: 'pointer' }}>Esporta</button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {providers.length === 0 ? (
            <p style={{ opacity: 0.7 }}>Nessun provider configurato.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {providers.map(p => (
                <li key={p.id} style={{ marginBottom: '0.5rem' }}>
                  <div 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      border: activeProvider === p.id ? '2px solid #007bff' : '1px solid #ddd',
                      background: activeProvider === p.id ? '#e7f3ff' : '#fff',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}
                  >
                    <button 
                      onClick={() => handleProviderClick(p.id)}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        padding: '0.75rem',
                        cursor: 'pointer',
                        border: 'none',
                        background: 'transparent',
                        color: '#333',
                        fontWeight: activeProvider === p.id ? 'bold' : 'normal'
                      }}>
                      {p.name}
                    </button>
                    <button 
                      onClick={(e) => handleDeleteProvider(e, p.id)}
                      style={{
                        padding: '0 0.5rem',
                        border: 'none',
                        background: 'transparent',
                        color: '#d9534f',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '1.2em'
                      }}
                      title="Elimina provider"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {activeProvider && (
          <button 
            onClick={handleResetSession}
            style={{
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              border: '1px solid #d9534f',
              background: '#fdf0ef',
              color: '#d9534f',
              borderRadius: '4px',
              marginTop: '1rem',
              fontWeight: 'bold'
            }}
          >
            Reset Sessione Attiva
          </button>
        )}

        <button 
          onClick={handleAddTestProvider}
          style={{
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            border: '1px solid #ccc',
            background: '#fff',
            color: 'inherit',
            borderRadius: '4px',
            marginTop: '1rem'
          }}
        >
          Aggiungi Provider Casuale
        </button>
      </aside>
      
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        position: 'relative',
        boxSizing: 'border-box'
      }}>
        {activeProvider ? (
          <div style={{ 
            height: '48px', 
            borderBottom: '1px solid #ccc',
            display: 'flex',
            alignItems: 'center',
            padding: '0 1rem',
            backgroundColor: '#f9f9f9',
            gap: '0.5rem'
          }}>
            <button 
              disabled={!viewState?.canGoBack} 
              onClick={() => window.glaia.providerView.navigateBack()}
            >
              ⬅ Back
            </button>
            <button 
              disabled={!viewState?.canGoForward} 
              onClick={() => window.glaia.providerView.navigateForward()}
            >
              ➡ Forward
            </button>
            <button 
              onClick={() => window.glaia.providerView.reload()}
            >
              ↻ Reload
            </button>
            
            <div style={{ marginLeft: '1rem', fontSize: '0.9em', color: '#666' }}>
              {viewState?.isLoading ? 'Caricamento in corso...' : ''}
              {viewState?.lastErrorCode ? `Errore: ${viewState.lastErrorCode} - ${viewState.lastErrorMessage}` : ''}
            </div>
          </div>
        ) : (
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            textAlign: 'center' 
          }}>
            <h1>Benvenuto in Glaia</h1>
            <p>Seleziona un provider dalla sidebar per iniziare.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App