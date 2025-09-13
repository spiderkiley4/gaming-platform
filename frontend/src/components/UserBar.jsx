import React from 'react';
import { resolveAvatarUrl } from '../utils/mediaUrl';

export default function UserBar({ user, onSettingsOpen }) {
  return (
    <div className="p-4 border-t border-primary bg-primary/10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {user?.avatar_url ? (
            <img 
              src={resolveAvatarUrl(user.avatar_url)} 
              alt={user.username} 
              className="w-8 h-8 rounded-full border-2 border-primary"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-primary">
              <span className="text-on-primary text-sm font-medium">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
          )}
          <span className="text-on-surface truncate font-medium">{user?.username || 'User'}</span>
        </div>
        <button
          onClick={onSettingsOpen}
          className="p-2 bg-primary hover:bg-primary/80 text-on-primary rounded transition-colors"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
