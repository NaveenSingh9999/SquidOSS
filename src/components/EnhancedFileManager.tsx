import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  FileText, Image, Archive, Code, FileQuestion, 
  Plus, Settings, FolderPlus, Search,
  Filter, SortAsc, SortDesc, MoreVertical, Folder, FolderOpen
} from '@/lib/icon-map';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getAllFiles, FileItem as FileItemType } from '@/lib/api';
import { 
  SMART_COLLECTIONS, 
  categorizeFilesBySmartCollections, 
  getUserCollections,
  createCollection,
  deleteCollection,
  addFileToCollection,
  removeFileFromCollection,
  getCollectionFiles,
  SmartCollection,
  Collection as CustomCollection
} from '@/lib/collections';
import FileManager from '@/components/FileManager';
import AdvancedSearch from '@/components/AdvancedSearch';

interface EnhancedFileManagerProps {
  onFileSelected?: (file: FileItemType) => void;
}

const EnhancedFileManager: React.FC<EnhancedFileManagerProps> = ({ onFileSelected }) => {
  const [allFiles, setAllFiles] = useState<FileItemType[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileItemType[]>([]);
  const [customCollections, setCustomCollections] = useState<CustomCollection[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [smartCollections, setSmartCollections] = useState<Record<string, FileItemType[]>>({});
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (allFiles.length > 0) {
      const categorized = categorizeFilesBySmartCollections(allFiles);
      setSmartCollections(categorized);
    }
  }, [allFiles]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [files, collections] = await Promise.all([
        getAllFiles(),
        getUserCollections()
      ]);
      
      setAllFiles(files.filter(item => !('is_folder' in item)) as FileItemType[]);
      setCustomCollections(collections);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load collections data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      toast({
        title: 'Error',
        description: 'Collection name cannot be empty',
        variant: 'destructive'
      });
      return;
    }

    try {
      await createCollection(newCollectionName);
      setNewCollectionName('');
      setShowCreateDialog(false);
      await loadData(); // Reload to get the new collection
      
      toast({
        title: 'Success',
        description: `Collection "${newCollectionName}" created successfully`
      });
    } catch (error: any) {
      console.error('Error creating collection:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create collection',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteCollection = async (collectionId: string, collectionName: string) => {
    try {
      await deleteCollection(collectionId);
      await loadData(); // Reload collections
      
      toast({
        title: 'Success',
        description: `Collection "${collectionName}" deleted successfully`
      });
      
      // If we're currently viewing the deleted collection, switch to 'all'
      if (activeTab === collectionId) {
        setActiveTab('all');
      }
    } catch (error: any) {
      console.error('Error deleting collection:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete collection',
        variant: 'destructive'
      });
    }
  };

  const getSmartCollectionIcon = (collectionId: string) => {
    const smartCollection = SMART_COLLECTIONS.find(c => c.id === collectionId);
    if (!smartCollection) return FileQuestion;
    
    switch (smartCollection.icon) {
      case 'FileText': return FileText;
      case 'Image': return Image;
      case 'Archive': return Archive;
      case 'Code': return Code;
      case 'FileQuestion': return FileQuestion;
      default: return FileQuestion;
    }
  };

  const getFilteredFiles = () => {
    if (!searchQuery) return allFiles;
    
    return allFiles.filter(file => 
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const getCurrentFiles = (): FileItemType[] => {
    // Use filtered files from advanced search if active, otherwise use simple search
    const baseFiles = showAdvancedSearch ? filteredFiles : getFilteredFiles();
    
    if (activeTab === 'all') {
      return baseFiles;
    }
    
    // Check if it's a smart collection
    const smartCollection = SMART_COLLECTIONS.find(c => c.id === activeTab);
    if (smartCollection) {
      return baseFiles.filter(file => smartCollection.filter(file));
    }
    
    // If it's a custom collection, we would need to fetch the files
    // For now, return empty array as we'll implement this when user selects custom collection
    return [];
  };

  const handleSearchResults = (results: FileItemType[]) => {
    setFilteredFiles(results);
  };

  const CollectionTabs = () => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="flex items-center gap-4 mb-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            All Files
          </TabsTrigger>
          
          {SMART_COLLECTIONS.slice(0, 4).map((collection) => {
            const IconComponent = getSmartCollectionIcon(collection.id);
            const fileCount = smartCollections[collection.id]?.length || 0;
            
            return (
              <TabsTrigger key={collection.id} value={collection.id} className="flex items-center gap-2">
                <IconComponent className="h-4 w-4" style={{ color: collection.color }} />
                <span>{collection.name}</span>
                <Badge variant="secondary" className="ml-1">
                  {fileCount}
                </Badge>
              </TabsTrigger>
            );
          })}
          
          <TabsTrigger value="others" className="flex items-center gap-2">
            <FileQuestion className="h-4 w-4 text-gray-500" />
            Others
            <Badge variant="secondary" className="ml-1">
              {smartCollections.others?.length || 0}
            </Badge>
          </TabsTrigger>
        </TabsList>
        
        <Button
          variant="outline"
          onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
          className="flex-shrink-0"
        >
          <Search className="h-4 w-4 mr-2" />
          {showAdvancedSearch ? 'Simple Search' : 'Advanced Search'}
        </Button>
        
        <Button
          variant="outline"
          onClick={() => setShowCreateDialog(true)}
          className="flex-shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Collection
        </Button>
      </div>

      {/* Custom Collections Row */}
      {customCollections.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen className="h-4 w-4" />
            <span className="font-medium text-sm">Custom Collections</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {customCollections.map((collection) => (
              <Button
                key={collection.id}
                variant={activeTab === collection.id ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab(collection.id)}
                className="flex items-center gap-2"
              >
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: collection.color || '#6B7280' }}
                />
                {collection.name}
                <Badge variant="secondary" className="ml-1">
                  {collection.file_count || 0}
                </Badge>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-4 w-4 p-0 ml-1">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Settings className="h-4 w-4 mr-2" />
                      Edit Collection
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => handleDeleteCollection(collection.id, collection.name)}
                    >
                      Delete Collection
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Search Section */}
      {showAdvancedSearch ? (
        <AdvancedSearch 
          onResults={handleSearchResults}
          onFiltersChange={(filters) => {
            // Handle filter changes if needed
            console.log('Search filters changed:', filters);
          }}
        />
      ) : (
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* Tab Contents */}
      <TabsContent value="all" className="mt-0">
        <CollectionView 
          title="All Files" 
          files={getCurrentFiles()} 
          onFileSelected={onFileSelected}
        />
      </TabsContent>

      {SMART_COLLECTIONS.map((collection) => (
        <TabsContent key={collection.id} value={collection.id} className="mt-0">
          <CollectionView 
            title={collection.name}
            description={collection.description}
            files={smartCollections[collection.id] || []}
            onFileSelected={onFileSelected}
            color={collection.color}
          />
        </TabsContent>
      ))}

      {customCollections.map((collection) => (
        <TabsContent key={collection.id} value={collection.id} className="mt-0">
          <CustomCollectionView
            collection={collection}
            onFileSelected={onFileSelected}
            onRefresh={loadData}
          />
        </TabsContent>
      ))}
    </Tabs>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CollectionTabs />
      
      {/* Create Collection Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Collection</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCollection}>
              Create Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Component for displaying a collection's files
const CollectionView: React.FC<{
  title: string;
  description?: string;
  files: FileItemType[];
  onFileSelected?: (file: FileItemType) => void;
  color?: string;
}> = ({ title, description, files, onFileSelected, color }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div 
          className="w-3 h-3 rounded-full" 
          style={{ backgroundColor: color || '#6B7280' }}
        />
        <div>
          <h3 className="font-semibold">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <Badge variant="secondary" className="ml-auto">
          {files.length} files
        </Badge>
      </div>
      
      {files.length === 0 ? (
        <Card className="flex flex-col items-center justify-center h-32 border-dashed">
          <FileQuestion className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No files in this collection</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {files.map((file) => (
            <Card 
              key={file.id}
              className="p-3 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => onFileSelected?.(file)}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
                  {getFileTypeIcon(file)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// Component for custom collection management
const CustomCollectionView: React.FC<{
  collection: CustomCollection;
  onFileSelected?: (file: FileItemType) => void;
  onRefresh: () => void;
}> = ({ collection, onFileSelected, onRefresh }) => {
  const [files, setFiles] = useState<FileItemType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCollectionFiles();
  }, [collection.id]);

  const loadCollectionFiles = async () => {
    try {
      setLoading(true);
      const collectionFiles = await getCollectionFiles(collection.id);
      setFiles(collectionFiles);
    } catch (error) {
      console.error('Error loading collection files:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <CollectionView
      title={collection.name}
      description={collection.description}
      files={files}
      onFileSelected={onFileSelected}
      color={collection.color}
    />
  );
};

// Helper function to get file type icon
const getFileTypeIcon = (file: FileItemType) => {
  if (file.type.startsWith('image/')) {
    return <Image className="h-4 w-4 text-green-500" />;
  } else if (file.type.startsWith('video/')) {
    return <FileText className="h-4 w-4 text-red-500" />;
  } else if (file.type.includes('pdf') || file.type.includes('document')) {
    return <FileText className="h-4 w-4 text-blue-500" />;
  } else if (file.type.includes('zip') || file.type.includes('rar')) {
    return <Archive className="h-4 w-4 text-orange-500" />;
  } else {
    return <FileQuestion className="h-4 w-4 text-gray-500" />;
  }
};

// Helper function to format file sizes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default EnhancedFileManager;