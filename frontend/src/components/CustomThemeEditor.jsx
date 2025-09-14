import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { colorCategories } from '../config/themes';

export default function CustomThemeEditor({ onClose }) {
  const { customTheme, updateCustomTheme, resetToDefault, customThemeTemplate } = useTheme();
  const [editingTheme, setEditingTheme] = useState({ ...customTheme });
  const [selectedCategory, setSelectedCategory] = useState('backgrounds');
  const [previewMode, setPreviewMode] = useState(true);

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
    // Reset the custom theme to default values
    setEditingTheme({ ...customThemeTemplate });
    // Don't close the editor, let user see the reset values
  };

  const renderPreview = (category, theme) => {
    const colors = theme.colors;
    
    switch (category) {
      case 'backgrounds':
        return (
          <div className="space-y-3">
            <div 
              className="p-3 rounded-lg"
              style={{ backgroundColor: colors.surface, color: colors.onSurface }}
            >
              Surface
            </div>
            <div 
              className="p-3 rounded-lg"
              style={{ backgroundColor: colors.surfaceVariant, color: colors.onSurfaceVariant }}
            >
              Surface Variant
            </div>
            <div 
              className="p-3 rounded-lg"
              style={{ backgroundColor: colors.hover, color: colors.onSurface }}
            >
              Hover State
            </div>
          </div>
        );
      
      case 'text':
        return (
          <div className="space-y-3">
            <div style={{ color: colors.onBackground }}>Primary Text</div>
            <div style={{ color: colors.onSurface }}>Surface Text</div>
            <div style={{ color: colors.onSurfaceVariant }}>Secondary Text</div>
            <div style={{ color: colors.onPrimary }}>On Primary Text</div>
          </div>
        );
      
      case 'primary':
        return (
          <div className="space-y-3">
            <button 
              className="px-4 py-2 rounded-lg"
              style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
            >
              Primary Button
            </button>
            <div 
              className="p-3 rounded-lg"
              style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }}
            >
              Primary Container
            </div>
          </div>
        );
      
      case 'secondary':
        return (
          <div className="space-y-3">
            <button 
              className="px-4 py-2 rounded-lg"
              style={{ backgroundColor: colors.secondary, color: colors.onSecondary }}
            >
              Secondary Button
            </button>
            <div 
              className="p-3 rounded-lg"
              style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}
            >
              Secondary Container
            </div>
          </div>
        );
      
      case 'status':
        return (
          <div className="space-y-3">
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: colors.success, color: colors.onSuccess }}
            >
              Success Message
            </div>
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: colors.warning, color: colors.onWarning }}
            >
              Warning Message
            </div>
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: colors.error, color: colors.onError }}
            >
              Error Message
            </div>
          </div>
        );
      
      case 'borders':
        return (
          <div className="space-y-3">
            <div 
              className="p-3 rounded-lg border-2"
              style={{ borderColor: colors.outline, color: colors.onSurface }}
            >
              Outline Border
            </div>
            <div 
              className="p-3 rounded-lg border-2"
              style={{ borderColor: colors.outlineVariant, color: colors.onSurface }}
            >
              Outline Variant Border
            </div>
          </div>
        );
      
      case 'voiceChat':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.muted }}
              />
              <span style={{ color: colors.onSurface }}>Muted</span>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.deafened }}
              />
              <span style={{ color: colors.onSurface }}>Deafened</span>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.speaking }}
              />
              <span style={{ color: colors.onSurface }}>Speaking</span>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.screenSharing }}
              />
              <span style={{ color: colors.onSurface }}>Screen Sharing</span>
            </div>
          </div>
        );
      
      case 'avatars':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                style={{ backgroundColor: colors.avatar, color: colors.avatarText }}
              >
                A
              </div>
              <span style={{ color: colors.onSurface }}>Avatar</span>
            </div>
          </div>
        );
      
      case 'toggles':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div 
                  className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:border-white peer-focus:ring-4 peer-focus:ring-blue-300"
                  style={{ 
                    backgroundColor: colors.toggleBackground,
                    borderColor: colors.outlineVariant
                  }}
                />
              </label>
              <span style={{ color: colors.onSurface }}>Toggle Switch</span>
            </div>
          </div>
        );
      
      default:
        return (
          <div style={{ color: colors.onSurface }}>
            Select a color category to see preview
          </div>
        );
    }
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
          <div className="w-64 bg-surface-variant border-r border-outline flex flex-col">
            <div className="p-4 border-b border-outline">
              <h3 className="text-lg font-semibold text-on-surface">Color Categories</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
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

            {/* Color Grid and Preview */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Color Controls */}
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
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

                {/* Preview Panel */}
                {previewMode && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-on-surface">Preview</h4>
                    <div 
                      className="p-4 rounded-lg border border-outline"
                      style={{ 
                        backgroundColor: editingTheme.colors.background,
                        color: editingTheme.colors.onBackground
                      }}
                    >
                      {renderPreview(selectedCategory, editingTheme)}
                    </div>
                  </div>
                )}
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
