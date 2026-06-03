import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import StorageTab from '@/components/StorageTab';
import { Navigate } from 'react-router-dom';

const StoragePage = () => {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <h1 className="text-3xl font-bold mb-6">Storage Management</h1>
      <StorageTab />
    </div>
  );
};

export default StoragePage;