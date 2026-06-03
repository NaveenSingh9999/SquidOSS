import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Search,
  Filter,
  X,
  Calendar as CalendarIcon,
  FileType,
  HardDrive,
  Tag,
  SortAsc,
  SortDesc,
  Clock,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Code,
  Folder
} from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { getAllFiles, FileItem as FileItemType } from '@/lib/api';
import { SMART_COLLECTIONS, getUserCollections, Collection } from '@/lib/collections';
import { format } from 'date-fns';

interface SearchFilters {
  query: string;
  fileTypes: string[];
  collections: string[];
  dateRange: {
    from?: Date;
    to?: Date;
  };
  sizeRange: {
    min: number;
    max: number;
  };
  tags: string[];
  sortBy: 'name' | 'size' | 'date' | 'type';
  sortDirection: 'asc' | 'desc';
  onlyShared: boolean;
  onlyEncrypted: boolean;
}

interface AdvancedSearchProps {
  onResults: (files: FileItemType[]) => void;
  onFiltersChange?: (filters: SearchFilters) => void;
}

const INITIAL_FILTERS: SearchFilters = {
  query: '',
  fileTypes: [],
  collections: [],
  dateRange: {},
  sizeRange: { min: 0, max: 1000 }, // MB
  tags: [],
  sortBy: 'date',
  sortDirection: 'desc',
  onlyShared: false,
  onlyEncrypted: false,
};

const FILE_TYPE_OPTIONS = [
  { id: 'image', label: 'Images', icon: Image, types: ['image/'] },
  { id: 'video', label: 'Videos', icon: Video, types: ['video/'] },
  { id: 'audio', label: 'Audio', icon: Music, types: ['audio/'] },
  { id: 'document', label: 'Documents', icon: FileText, types: ['application/pdf', 'application/msword', 'text/'] },
  { id: 'archive', label: 'Archives', icon: Archive, extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'] },
  { id: 'code', label: 'Code', icon: Code, extensions: ['.js', '.ts', '.py', '.html', '.css', '.json'] },
];

const AdvancedSearch: React.FC<AdvancedSearchProps> = ({ onResults, onFiltersChange }) => {
  const [filters, setFilters] = useState<SearchFilters>(INITIAL_FILTERS);
  const [allFiles, setAllFiles] = useState<FileItemType[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const results = performSearch();
    onResults(results);
    onFiltersChange?.(filters);
  }, [filters, allFiles]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [filesData, collectionsData] = await Promise.all([
        getAllFiles(),
        getUserCollections()
      ]);
      
      const files = filesData.filter(item => !('is_folder' in item)) as FileItemType[];
      setAllFiles(files);
      setCollections(collectionsData);
      
      // Extract unique tags
      const tags = new Set<string>();
      files.forEach(file => {
        if (file.tags) {
          file.tags.forEach(tag => tags.add(tag));
        }
      });
      setAllTags(Array.from(tags));
      
      // Set reasonable size range based on actual files
      if (files.length > 0) {
        const maxSize = Math.max(...files.map(f => f.size)) / (1024 * 1024); // Convert to MB
        setFilters(prev => ({
          ...prev,
          sizeRange: { min: 0, max: Math.ceil(maxSize) || 100 }
        }));
      }
    } catch (error) {
      console.error('Error loading search data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load files for search',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const performSearch = (): FileItemType[] => {
    if (allFiles.length === 0) return [];

    let results = [...allFiles];

    // Text search
    if (filters.query.trim()) {
      const query = filters.query.toLowerCase();
      results = results.filter(file => 
        file.name.toLowerCase().includes(query) ||
        file.type.toLowerCase().includes(query) ||
        (file.tags && file.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    // File type filter
    if (filters.fileTypes.length > 0) {
      results = results.filter(file => {
        return filters.fileTypes.some(typeId => {
          const typeOption = FILE_TYPE_OPTIONS.find(opt => opt.id === typeId);
          if (!typeOption) return false;
          
          if (typeOption.types) {
            return typeOption.types.some(type => file.type.startsWith(type));
          }
          
          if (typeOption.extensions) {
            return typeOption.extensions.some(ext => file.name.toLowerCase().endsWith(ext));
          }
          
          return false;
        });
      });
    }

    // Collection filter (Smart Collections)
    if (filters.collections.length > 0) {
      results = results.filter(file => {
        return filters.collections.some(collectionId => {
          const smartCollection = SMART_COLLECTIONS.find(c => c.id === collectionId);
          if (smartCollection) {
            return smartCollection.filter(file);
          }
          // TODO: Handle custom collections when implemented
          return false;
        });
      });
    }

    // Date range filter
    if (filters.dateRange.from || filters.dateRange.to) {
      results = results.filter(file => {
        const fileDate = new Date(file.created_at);
        if (filters.dateRange.from && fileDate < filters.dateRange.from) return false;
        if (filters.dateRange.to && fileDate > filters.dateRange.to) return false;
        return true;
      });
    }

    // Size range filter
    const minBytes = filters.sizeRange.min * 1024 * 1024;
    const maxBytes = filters.sizeRange.max * 1024 * 1024;
    results = results.filter(file => file.size >= minBytes && file.size <= maxBytes);

    // Tags filter
    if (filters.tags.length > 0) {
      results = results.filter(file => 
        file.tags && filters.tags.some(tag => file.tags!.includes(tag))
      );
    }

    // Additional filters
    if (filters.onlyShared) {
      results = results.filter(file => file.shared);
    }

    if (filters.onlyEncrypted) {
      results = results.filter(file => file.encrypted);
    }

    // Sorting
    results.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      
      return filters.sortDirection === 'desc' ? -comparison : comparison;
    });

    return results;
  };

  const updateFilters = (newFilters: Partial<SearchFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const hasActiveFilters = useMemo(() => {
    return filters.query !== '' ||
           filters.fileTypes.length > 0 ||
           filters.collections.length > 0 ||
           filters.dateRange.from ||
           filters.dateRange.to ||
           filters.tags.length > 0 ||
           filters.onlyShared ||
           filters.onlyEncrypted;
  }, [filters]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Main Search Bar */}
       <div className="flex gap-2">
         <div className="relative flex-1">
           <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
           <Input
             placeholder="Search files by name, type, or tags..."
             value={filters.query}
             onChange={(e) => updateFilters({ query: e.target.value })}
             className="pl-10"
           />
         </div>
         
         <Button
           variant="outline"
           onClick={() => setShowFilters(!showFilters)}
           className="flex items-center gap-2 px-3 text-sm transition-none"
         >
           <Filter className="h-4 w-4 opacity-60" />
           Filters
           {hasActiveFilters && (
             <Badge variant="secondary" className="ml-1 h-4 w-4 rounded-full p-0 flex items-center justify-center text-xs">
               !
             </Badge>
           )}
         </Button>
         
         {hasActiveFilters && (
           <Button variant="outline" onClick={clearFilters} className="flex items-center gap-2 px-3 text-sm transition-none">
             <X className="h-4 w-4 opacity-60" />
             Clear
           </Button>
         )}
       </div>

      {/* Active Filters */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.fileTypes.map(typeId => {
            const typeOption = FILE_TYPE_OPTIONS.find(opt => opt.id === typeId);
            return typeOption ? (
              <Badge key={typeId} variant="secondary" className="flex items-center gap-1">
                <typeOption.icon className="h-3 w-3" />
                {typeOption.label}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => updateFilters({ 
                    fileTypes: filters.fileTypes.filter(t => t !== typeId) 
                  })}
                />
              </Badge>
            ) : null;
          })}
          
          {filters.collections.map(collectionId => {
            const collection = SMART_COLLECTIONS.find(c => c.id === collectionId);
            return collection ? (
              <Badge key={collectionId} variant="secondary" className="flex items-center gap-1">
                {collection.name}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => updateFilters({ 
                    collections: filters.collections.filter(c => c !== collectionId) 
                  })}
                />
              </Badge>
            ) : null;
          })}
          
          {filters.onlyShared && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Shared Only
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => updateFilters({ onlyShared: false })}
              />
            </Badge>
          )}
          
          {filters.onlyEncrypted && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Encrypted Only
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => updateFilters({ onlyEncrypted: false })}
              />
            </Badge>
          )}
        </div>
      )}

      {/* Advanced Filters Panel */}
      {showFilters && (
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* File Types */}
            <div className="space-y-2">
              <label className="text-sm font-medium">File Types</label>
              <div className="space-y-2">
                {FILE_TYPE_OPTIONS.map(option => (
                  <div key={option.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={option.id}
                      checked={filters.fileTypes.includes(option.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          updateFilters({ fileTypes: [...filters.fileTypes, option.id] });
                        } else {
                          updateFilters({ fileTypes: filters.fileTypes.filter(t => t !== option.id) });
                        }
                      }}
                    />
                    <label htmlFor={option.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <option.icon className="h-4 w-4" />
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Collections */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Collections</label>
              <div className="space-y-2">
                {SMART_COLLECTIONS.slice(0, -1).map(collection => (
                  <div key={collection.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={collection.id}
                      checked={filters.collections.includes(collection.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          updateFilters({ collections: [...filters.collections, collection.id] });
                        } else {
                          updateFilters({ collections: filters.collections.filter(c => c !== collection.id) });
                        }
                      }}
                    />
                    <label htmlFor={collection.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: collection.color }}
                      />
                      {collection.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <div className="space-y-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateRange.from ? (
                        filters.dateRange.to ? (
                          <>
                            {format(filters.dateRange.from, "LLL dd, y")} -{" "}
                            {format(filters.dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(filters.dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        "Pick a date range"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={filters.dateRange?.from}
                      selected={filters.dateRange as any}
                      onSelect={(range: any) => updateFilters({ dateRange: range || {} })}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* File Size Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                File Size Range: {formatBytes(filters.sizeRange.min * 1024 * 1024)} - {formatBytes(filters.sizeRange.max * 1024 * 1024)}
              </label>
              <Slider
                value={[filters.sizeRange.min, filters.sizeRange.max]}
                onValueChange={([min, max]) => updateFilters({ sizeRange: { min, max } })}
                max={filters.sizeRange.max || 100}
                step={1}
                className="w-full"
              />
            </div>

            {/* Tags */}
            {allTags.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Tags</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {allTags.map(tag => (
                    <div key={tag} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tag-${tag}`}
                        checked={filters.tags.includes(tag)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            updateFilters({ tags: [...filters.tags, tag] });
                          } else {
                            updateFilters({ tags: filters.tags.filter(t => t !== tag) });
                          }
                        }}
                      />
                      <label htmlFor={`tag-${tag}`} className="text-sm cursor-pointer">
                        #{tag}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Options */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Additional Filters</label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="only-shared"
                    checked={filters.onlyShared}
                    onCheckedChange={(checked) => updateFilters({ onlyShared: !!checked })}
                  />
                  <label htmlFor="only-shared" className="text-sm cursor-pointer">
                    Shared files only
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="only-encrypted"
                    checked={filters.onlyEncrypted}
                    onCheckedChange={(checked) => updateFilters({ onlyEncrypted: !!checked })}
                  />
                  <label htmlFor="only-encrypted" className="text-sm cursor-pointer">
                    Encrypted files only
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Sort Options */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Sort by:</label>
                <Select
                  value={filters.sortBy}
                  onValueChange={(value: any) => updateFilters({ sortBy: value })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="size">Size</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="type">Type</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateFilters({ 
                  sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' 
                })}
                className="flex items-center gap-2"
              >
                {filters.sortDirection === 'asc' ? (
                  <SortAsc className="h-4 w-4" />
                ) : (
                  <SortDesc className="h-4 w-4" />
                )}
                {filters.sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdvancedSearch;