
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from '@/lib/icon-map';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const HelpContent = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const contentSections = {
    overview: {
      title: 'Overview',
      content: [
        {
          title: 'What is SquidCloud?',
          text: 'SquidCloud is a secure, decentralized cloud storage platform that prioritizes privacy and security through client-side encryption and distributed storage systems.'
        },
        {
          title: 'Key Features',
          text: 'End-to-end encryption, unlimited storage, secure file sharing, and built-in file preview capabilities.'
        }
      ]
    },
    security: {
      title: 'Security & Privacy',
      content: [
        {
          title: 'Client-Side Encryption',
          text: 'All files are encrypted using AES-256-GCM encryption before leaving your device. The encryption key never leaves your device, ensuring complete privacy.'
        },
        {
          title: 'Zero-Knowledge Architecture',
          text: 'We employ a zero-knowledge architecture, meaning we cannot access your files or encryption keys. Only you have control over your data.'
        }
      ]
    },
    technology: {
      title: 'Technology',
      content: [
        {
          title: 'Res54 Technology',
          text: 'Our proprietary Res54 technology enables high-speed parallel transfers and intelligent file chunking for optimal performance.'
        },
        {
          title: 'Storage Architecture',
          text: 'Files are split into encrypted chunks and distributed across multiple storage buckets, ensuring redundancy and high availability.'
        },
        {
          title: 'Encryption Process',
          text: 'Files undergo AES-256-GCM encryption with unique keys. Large files are automatically split into chunks, encrypted individually, and reassembled during download.'
        }
      ]
    },
    faq: {
      title: 'FAQ',
      content: [
        {
          title: 'How does file chunking work?',
          text: 'Large files are automatically split into smaller chunks (typically 10MB each) for efficient handling. Each chunk is encrypted separately and uploaded in parallel, improving transfer speeds and reliability.'
        },
        {
          title: 'How are my files stored?',
          text: 'Your files are encrypted, split into chunks, and distributed across multiple secure storage buckets. This decentralized approach ensures high availability and protects against data loss.'
        },
        {
          title: 'Can SquidCloud access my files?',
          text: 'No. Due to client-side encryption, your files are encrypted before leaving your device. We never have access to your encryption keys or unencrypted data.'
        },
        {
          title: 'How does file sharing work?',
          text: 'You can share files securely by generating encrypted links. Recipients can access files through these links, and you can set expiration times and access codes for additional security.'
        }
      ]
    }
  };

  const filterContent = (content: any) => {
    if (!searchTerm) return content;
    return Object.entries(content).reduce((acc: any, [key, section]: [string, any]) => {
      const filteredContent = section.content.filter((item: any) =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.text.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filteredContent.length > 0) {
        acc[key] = { ...section, content: filteredContent };
      }
      return acc;
    }, {});
  };

  const filteredSections = filterContent(contentSections);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documentation..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          {Object.keys(contentSections).map((tab) => (
            <TabsTrigger key={tab} value={tab} className="capitalize">
              {contentSections[tab as keyof typeof contentSections].title}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(filteredSections).map(([key, section]: [string, any]) => (
          <TabsContent key={key} value={key} className="space-y-4">
            {section.content.map((item: any, index: number) => (
              <div key={index} className="space-y-2">
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default HelpContent;
