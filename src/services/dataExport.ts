
import { supabase } from '@/integrations/supabase/client';
import { jsPDF } from 'jspdf';

export interface UserExportData {
  profile: any;
  files: any[];
  apiKeys: any[];
  loginSessions: any[];
  accountChanges: any[];
  exportDate: string;
}

export const exportUserData = async (userId: string): Promise<Blob> => {
  try {
    // Fetch all user data
    const [profileData, filesData, apiKeysData, loginSessionsData, accountChangesData] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('files').select('*').eq('user_id', userId),
      supabase.from('api_keys').select('*').eq('user_id', userId),
      supabase.from('login_sessions').select('*').eq('user_id', userId),
      supabase.from('account_changes').select('*').eq('user_id', userId)
    ]);

    const exportData: UserExportData = {
      profile: profileData.data,
      files: filesData.data || [],
      apiKeys: apiKeysData.data || [],
      loginSessions: loginSessionsData.data || [],
      accountChanges: accountChangesData.data || [],
      exportDate: new Date().toISOString()
    };

    // Create PDF
    const pdf = new jsPDF();
    let yPosition = 20;
    const lineHeight = 7;
    const pageHeight = pdf.internal.pageSize.height;

    // Helper function to add new page if needed
    const checkNewPage = () => {
      if (yPosition > pageHeight - 30) {
        pdf.addPage();
        yPosition = 20;
      }
    };

    // Helper function to add text with word wrap
    const addText = (text: string, fontSize = 10) => {
      pdf.setFontSize(fontSize);
      const splitText = pdf.splitTextToSize(text, 180);
      
      for (const line of splitText) {
        checkNewPage();
        pdf.text(line, 15, yPosition);
        yPosition += lineHeight;
      }
    };

    // Title
    pdf.setFontSize(16);
    pdf.text('SquidCloud - Personal Data Export', 15, yPosition);
    yPosition += 15;

    // Export date
    addText(`Export Date: ${new Date(exportData.exportDate).toLocaleString()}`, 12);
    yPosition += 10;

    // Profile Information
    addText('PROFILE INFORMATION', 14);
    yPosition += 5;
    if (exportData.profile) {
      addText(`User ID: ${exportData.profile.id}`);
      addText(`Email: ${exportData.profile.email || 'N/A'}`);
      addText(`Display Name: ${exportData.profile.display_name || 'N/A'}`);
      addText(`Full Name: ${exportData.profile.full_name || 'N/A'}`);
      addText(`Username: ${exportData.profile.username || 'N/A'}`);
      addText(`Premium Account: ${exportData.profile.is_premium ? 'Yes' : 'No'}`);
      addText(`MFA Enabled: ${exportData.profile.mfa_enabled ? 'Yes' : 'No'}`);
      addText(`Storage Used: ${exportData.profile.storage_used || 0} bytes`);
      addText(`Account Created: ${new Date(exportData.profile.created_at).toLocaleString()}`);
    }
    yPosition += 10;

    // Files
    addText('FILES', 14);
    yPosition += 5;
    addText(`Total Files: ${exportData.files.length}`);
    yPosition += 5;
    
    exportData.files.forEach((file, index) => {
      checkNewPage();
      addText(`${index + 1}. ${file.name}`);
      addText(`   Size: ${file.size} bytes`);
      addText(`   Type: ${file.type}`);
      addText(`   Created: ${new Date(file.created_at).toLocaleString()}`);
      addText(`   Encrypted: ${file.encrypted ? 'Yes' : 'No'}`);
      addText(`   Shared: ${file.shared ? 'Yes' : 'No'}`);
      yPosition += 3;
    });
    yPosition += 10;

    // API Keys
    addText('API KEYS', 14);
    yPosition += 5;
    addText(`Total API Keys: ${exportData.apiKeys.length}`);
    yPosition += 5;
    
    exportData.apiKeys.forEach((key, index) => {
      checkNewPage();
      addText(`${index + 1}. ${key.name}`);
      addText(`   Key Prefix: ${key.key_prefix}`);
      addText(`   Created: ${new Date(key.created_at).toLocaleString()}`);
      addText(`   Last Used: ${key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}`);
      addText(`   Active: ${key.is_active ? 'Yes' : 'No'}`);
      addText(`   Scopes: ${key.scopes?.join(', ') || 'None'}`);
      yPosition += 3;
    });
    yPosition += 10;

    // Login Sessions
    addText('LOGIN SESSIONS', 14);
    yPosition += 5;
    addText(`Total Sessions: ${exportData.loginSessions.length}`);
    yPosition += 5;
    
    exportData.loginSessions.forEach((session, index) => {
      checkNewPage();
      addText(`${index + 1}. ${session.device_name || 'Unknown Device'}`);
      addText(`   IP Address: ${session.ip_address || 'N/A'}`);
      addText(`   Created: ${new Date(session.created_at).toLocaleString()}`);
      addText(`   Last Active: ${new Date(session.last_active).toLocaleString()}`);
      yPosition += 3;
    });
    yPosition += 10;

    // Account Changes
    addText('ACCOUNT CHANGES', 14);
    yPosition += 5;
    addText(`Total Changes: ${exportData.accountChanges.length}`);
    yPosition += 5;
    
    exportData.accountChanges.slice(0, 50).forEach((change, index) => { // Limit to last 50 changes
      checkNewPage();
      addText(`${index + 1}. ${change.change_type}`);
      addText(`   Date: ${new Date(change.created_at).toLocaleString()}`);
      addText(`   IP: ${change.ip_address || 'N/A'}`);
      yPosition += 3;
    });

    // Footer
    checkNewPage();
    yPosition += 10;
    addText('This export contains all personal data associated with your SquidCloud account.', 8);
    addText('For questions about this data or to request deletion, please contact support.', 8);

    return pdf.output('blob');
  } catch (error) {
    console.error('Error exporting user data:', error);
    throw new Error('Failed to export user data');
  }
};
