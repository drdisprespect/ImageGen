import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import ChatBot from './ChatBot';

const initialSuggestions = [
  "sunset", "mountains", "forest", "cityscape", "abstract", 
  "vintage", "futuristic", "space", "cyberpunk", "waterfall",
  "beach", "night sky", "aurora", "rainforest", "desert",
  "ocean", "galaxy", "minimal", "vibrant", "surreal"
];

function initializeBubbles() {
  const shuffled = [...initialSuggestions].sort(() => 0.5 - Math.random());
  const visible = shuffled.slice(0, 5).map((text, index) => ({
    id: index,
    text,
    top: Math.random() * 150 + 20,
    left: Math.random() * 600 + 20,
    duration: Math.random() * 5 + 5,
    popped: false,
    floatX: Math.random() * 400 - 200,
    floatY: Math.random() * 200 - 100
  }));
  const standby = shuffled.slice(5).map((text, index) => ({
    id: index + 5,
    text,
    top: Math.random() * 150 + 20,
    left: Math.random() * 600 + 20,
    duration: Math.random() * 5 + 5,
    popped: false,
    floatX: Math.random() * 400 - 200,
    floatY: Math.random() * 200 - 100
  }));
  return { visible, standby };
}

function App() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('model1');
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState(0);
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [cursorPos, setCursorPos] = useState({ x: -50, y: -50 });
  const [visibleBubbles, setVisibleBubbles] = useState([]);
  const [standbyBubbles, setStandbyBubbles] = useState([]);
  const [draggingBubble, setDraggingBubble] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const bubblesContainerRef = useRef(null);

  const models = [
    { value: 'model1', label: 'Asian Model' },
    { value: 'model2', label: 'Anime Model' },
    { value: 'dalle', label: 'DALL·E' }
  ];

  useEffect(() => {
    const { visible, standby } = initializeBubbles();
    setVisibleBubbles(visible);
    setStandbyBubbles(standby);
  }, []);

  const fetchGallery = async () => {
    try {
      const res = await fetch('http://localhost:8080/gallery');
      const data = await res.json();
      console.log("Fetched gallery images:", data.images);
      setGalleryImages(data.images || []);
    } catch (error) {
      console.error("Error fetching gallery:", error);
    }
  };

  useEffect(() => {
    fetchGallery();
  }, [loading]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    function handleMouseMove(e) {
      if (draggingBubble && bubblesContainerRef.current) {
        const containerRect = bubblesContainerRef.current.getBoundingClientRect();
        setVisibleBubbles((prev) =>
          prev.map((b) =>
            b.id === draggingBubble.id
              ? {
                  ...b,
                  left: e.clientX - containerRect.left - draggingBubble.offsetX,
                  top: e.clientY - containerRect.top - draggingBubble.offsetY,
                }
              : b
          )
        );
      }
    }
    function handleMouseUp(e) {
      if (draggingBubble && dragStart) {
        const dx = e.clientX - dragStart.startX;
        const dy = e.clientY - dragStart.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) {
          handleBubbleClick(draggingBubble.id);
        }
      }
      setDraggingBubble(null);
      setDragStart(null);
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingBubble, dragStart]);

  const handleBubbleMouseDown = (e, bubble) => {
    e.preventDefault();
    const targetRect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - targetRect.left;
    const offsetY = e.clientY - targetRect.top;
    setDraggingBubble({ id: bubble.id, offsetX, offsetY });
    setDragStart({ id: bubble.id, startX: e.clientX, startY: e.clientY });
  };

  const handleBubbleClick = (bubbleId) => {
    const bubble = visibleBubbles.find(b => b.id === bubbleId);
    if (!bubble) return;
    setPrompt(prev => prev + (prev ? " " : "") + bubble.text);
    setVisibleBubbles(prev => prev.map(b => b.id === bubbleId ? { ...b, popped: true } : b));
    setTimeout(() => {
      setVisibleBubbles(prev => prev.filter(b => b.id !== bubbleId));
      if (standbyBubbles.length > 0) {
        const newBubble = standbyBubbles[0];
        setStandbyBubbles(prev => prev.slice(1));
        setVisibleBubbles(prev => [...prev, newBubble]);
      }
    }, 300);
  };

  const pollingIntervalRef = useRef(null);
  const pollProgress = (selectedModel) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8080/progress?model=${selectedModel}`);
        const data = await res.json();
        setProgress(data.progress);
        setEta(data.eta);
        if (data.progress >= 100) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          setLoading(false);
        }
      } catch (error) {
        console.error("Error polling progress:", error);
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }, 1000);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (prompt.trim() === "") {
      alert("Please enter a prompt before generating an image.");
      return;
    }
    setProgress(0);
    setEta(0);
    setImageUrl('');
    setImageError(false);
    setLoading(true);

    let progressInterval;
    if (model !== 'dalle') {
      progressInterval = pollProgress(model);
    }

    try {
      const response = await fetch('http://localhost:8080/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
      } else {
        setImageError(true);
      }
      fetchGallery();
      if (model === 'dalle') {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error in handleGenerate:", error);
      setImageError(true);
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setLoading(false);
    setProgress(0);
    setEta(0);
    fetch('http://localhost:8080/cancel', { method: 'POST' })
      .catch((error) => console.error("Error cancelling generation:", error));
  };

  

  const handleRegenerate = () => {
    setPrompt('');
    setImageUrl('');
    setProgress(0);
    setEta(0);
    setImageError(false);
    const { visible, standby } = initializeBubbles();
    setVisibleBubbles(visible);
    setStandbyBubbles(standby);
  };

  const toggleDarkMode = () => setDarkMode(!darkMode);

  useEffect(() => {
    darkMode
      ? document.body.classList.add('dark-mode')
      : document.body.classList.remove('dark-mode');
  }, [darkMode]);

  const getImageUrl = () => {
    let url = imageUrl.startsWith("http")
      ? imageUrl
      : `http://localhost:8080${imageUrl}`;
    return `${url}?t=${new Date().getTime()}`;
  };

  const handleSidebarMouseLeave = () => {
    if (!selectedGalleryImage) {
      setSidebarExpanded(false);
    }
  };

  const handleSidebarClose = () => {
    setSidebarExpanded(false);
  };

  return (
    <div className="app-wrapper">
      {/* Sidebar with Gallery Navigation */}
      <div 
        className={`sidebar ${sidebarExpanded ? "expanded" : "minimized"}`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={handleSidebarMouseLeave}
      >
        {sidebarExpanded ? (
          <div className="sidebar-content">
            <button 
              className="sidebar-close-button" 
              onClick={handleSidebarClose}
            >
              X
            </button>
            <h2>Gallery</h2>
            <div className="gallery-scroll">
              {galleryImages.length > 0 ? (
                galleryImages.map((imgUrl, idx) => (
                  <img
                    key={idx}
                    src={imgUrl}
                    alt={`Gallery ${idx}`}
                    className="gallery-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedGalleryImage(imgUrl);
                    }}
                  />
                ))
              ) : (
                <p>No images available.</p>
              )}
            </div>
          </div>
        ) : (
          <button 
            className="sidebar-gallery-button" 
            onClick={() => setSidebarExpanded(true)}
          >
            :
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="main-content">
        <header className="app-header">
          <button className="toggle-button" onClick={toggleDarkMode}>
            {darkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
        </header>

        {/* Unified Input Container (Two-Level Layout) */}
        <div className="unified-input-container">
          <div className="input-row">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGenerate(e);
                }
              }}
              placeholder="Enter your prompt here..."
              className="prompt-input"
              required
            />
          </div>
          <div className="controls-row">
            <div className="model-select-container">
              <button 
                type="button" 
                className="model-select-button" 
                onClick={() => setShowModelDropdown(!showModelDropdown)}
              >
                {models.find(m => m.value === model)?.label || 'Select Model'}
              </button>
              {showModelDropdown && (
                <div className="model-dropdown">
                  {models.map(m => (
                    <div 
                      key={m.value} 
                      className="model-dropdown-item" 
                      onClick={() => {
                        setModel(m.value);
                        setShowModelDropdown(false);
                      }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {loading ? (
              <button 
                type="button" 
                className="arrow-button cancel-arrow-button" 
                onClick={handleCancel}
              >
                X
              </button>
            ) : (
              <button 
                type="button" 
                className="arrow-button" 
                onClick={handleGenerate}
                disabled={loading}
              >
                &#8594;
              </button>
            )}
          </div>
        </div>

        {/* Bubbles/Loading Container (Fixed Space) */}
        <div className="bubbles-loading-container" style={{ maxWidth: '37.5rem', margin: '0 auto', height: '9.375rem' }}>
          {loading ? (
            <div className="loading-container">
              {model === "dalle" ? (
                <div className="spinner">
                  <div className="loader"></div>
                  <p>Loading... (estimated 30 seconds)</p>
                </div>
              ) : (
                <div className="progress-container">
                  <progress value={progress} max="100" className="progress-bar"></progress>
                  <div className="progress-info">
                    <span className="progress-text">{progress}%</span>
                    <span className="eta-text">ETA: {eta} sec</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bubbles-container" ref={bubblesContainerRef}>
              {visibleBubbles.map(bubble => (
                <div
                  key={bubble.id}
                  className={`bubble ${bubble.popped ? 'pop' : ''}`}
                  style={{
                    top: `${bubble.top}px`,
                    left: `${bubble.left}px`,
                    animationDuration: `${bubble.duration}s`,
                    '--float-x': `${bubble.floatX}px`,
                    '--float-y': `${bubble.floatY}px`
                  }}
                  onMouseDown={(e) => handleBubbleMouseDown(e, bubble)}
                >
                  {bubble.text}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generated Image Container (Always Rendered) */}
        <div className="generated-image-container">
          {imageUrl ? (
            imageError ? (
              <p className="error-text">Image generation failed or could not be loaded.</p>
            ) : (
              <img
                src={getImageUrl()}
                alt="Generated"
                className="generated-image"
                onError={() => setImageError(true)}
              />
            )
          ) : (
            <img 
              src="placeholder.png" 
              alt="Placeholder" 
              className="placeholder-image" 
            />
          )}
        </div>
      </div>

      {/* Gallery Modal */}
      {selectedGalleryImage && (
        <div className="gallery-modal" onClick={() => setSelectedGalleryImage(null)}>
          <img
            src={selectedGalleryImage}
            alt="Expanded Gallery"
            className="expanded-gallery-image"
          />
        </div>
      )}

      {/* Fluid Dynamic Cursor Follower */}
      <div
        className="cursor-follower"
        style={{ transform: `translate(${cursorPos.x}px, ${cursorPos.y}px)` }}
      ></div>
      <ChatBot />
    </div>
  );
}

export default App;
