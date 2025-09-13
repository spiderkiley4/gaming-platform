import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { colorCategories } from '../config/themes';

export default function CustomThemeEditor({ onClose }) {
  const { customTheme, updateCustomTheme, resetToDefault } = useTheme();
  const [editingTheme, setEditingTheme] = useState({ ...customTheme });
  const [selectedCategory, setSelectedCategory] = useState('backgrounds');
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    setEditingTheme({ ...customTheme });
  }, [customTheme]);

  const handleColorChange = (colorKey, newValue) => {
    setEditingTheme(prev => ({
      ...prev,
      colors: {
        ...prev.colors,
        [colorKey]: newValue
      }
    }));
  };

  const handleSave = () => {
    updateCustomTheme(editingTheme);
    onClose();
  };

  const handleReset = () => {
    setEditingTheme({ ...customTheme });
  };

  const handleResetToDefault = () => {
    resetToDefault();
    onClose();
  };

  const currentCategory = colorCategories[selectedCategory];

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface w-full h-full max-w-6xl max-h-[90vh] rounded-lg border border-outline flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-outline">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-on-surface">Custom Theme Editor</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-hover rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-on-surface" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Color Categories */}
          <div className="w-64 bg-surface-variant border-r border-outline p-4">
            <h3 className="text-lg font-semibold text-on-surface mb-4">Color Categories</h3>
            <div className="space-y-2">
              {Object.entries(colorCategories).map(([key, category]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedCategory === key
                      ? 'bg-primary text-on-primary'
                      : 'hover:bg-hover text-on-surface'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* Main Content - Color Editor */}
          <div className="flex-1 flex flex-col">
            {/* Preview Toggle */}
            <div className="p-4 border-b border-outline">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-on-surface">
                  {currentCategory.name}
                </h3>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-on-surface">
                    <input
                      type="checkbox"
                      checked={previewMode}
                      onChange={(e) => setPreviewMode(e.target.checked)}
                      className="rounded"
                    />
                    Preview Mode
                  </label>
                </div>
              </div>
            </div>

            {/* Color Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {currentCategory.colors.map((colorKey) => (
                  <div key={colorKey} className="space-y-2">
                    <label className="block text-sm font-medium text-on-surface">
                      {colorKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </label>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-lg border-2 border-outline cursor-pointer"
                        style={{ backgroundColor: editingTheme.colors[colorKey] }}
                        onClick={() => {
                          const input = document.getElementById(`color-${colorKey}`);
                          input?.click();
                        }}
                      />
                      <input
                        id={`color-${colorKey}`}
                        type="color"
                        value={editingTheme.colors[colorKey]}
                        onChange={(e) => handleColorChange(colorKey, e.target.value)}
                        className="w-0 h-0 opacity-0 absolute"
                      />
                      <input
                        type="text"
                        value={editingTheme.colors[colorKey]}
                        onChange={(e) => handleColorChange(colorKey, e.target.value)}
                        className="flex-1 px-3 py-2 bg-surface-variant border border-outline rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer - Actions */}
            <div className="p-6 border-t border-outline">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleResetToDefault}
                    className="px-4 py-2 bg-secondary hover:bg-secondary-container text-on-secondary rounded-lg transition-colors"
                  >
                    Reset to Default
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-surface-variant hover:bg-hover text-on-surface rounded-lg transition-colors"
                  >
                    Reset Changes
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-surface-variant hover:bg-hover text-on-surface rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg transition-colors"
                  >
                    Save Theme
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
