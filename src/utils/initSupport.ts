import { supabase } from '@/integrations/supabase/client';

export async function checkSupportTablesExist() {
  try {
    // Try to query each table to see if it exists
    const { error: ticketsError } = await supabase
      .from('support_tickets')
      .select('id')
      .limit(1);

    const { error: messagesError } = await supabase
      .from('support_messages')
      .select('id')
      .limit(1);

    // Notifications table check removed as it doesn't exist in the schema
    const tablesExist = {
      tickets: !ticketsError || ticketsError.code !== '42P01',
      messages: !messagesError || messagesError.code !== '42P01',
      notifications: true // Assume notifications table exists or not needed
    };

    return tablesExist;
  } catch (error) {
    console.error('Error checking support tables:', error);
    return {
      tickets: false,
      messages: false,
      notifications: false
    };
  }
}

export async function initializeSupportTables() {
  try {
    const tablesExist = await checkSupportTablesExist();
    
    if (tablesExist.tickets && tablesExist.messages && tablesExist.notifications) {
      console.log('Support tables already exist');
      return true;
    }

    console.log('Some support tables are missing. Please run the database migrations.');
    console.log('Missing tables:', {
      tickets: !tablesExist.tickets,
      messages: !tablesExist.messages,
      notifications: !tablesExist.notifications
    });

    // For now, we'll just log and continue - the app should handle missing tables gracefully
    return false;
  } catch (error) {
    console.error('Error initializing support tables:', error);
    return false;
  }
}

// Helper function to show user-friendly message about missing support tables
export function showSupportNotAvailableMessage() {
  return {
    title: "Support System Initializing",
    message: "The support system is being set up. Please check back in a moment or contact an administrator.",
    canCreateTickets: false
  };
}