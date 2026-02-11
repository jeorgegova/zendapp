// src/services/syncService.js
import { checkConnection } from './services';
import { getDbConnection, getData, updateData } from '../database/db';
import { registerMovement, createPay } from './services';
import NetInfo from '@react-native-community/netinfo';

class SyncService {
  static async syncPendingRecords() {
    const db = await getDbConnection();
    const isConnected = await checkConnection();
    
    if (!isConnected) {
      console.log('Sin conexión, no se puede sincronizar');
      return false;
    }
    
    // Obtener registros pendientes de sincronización
    const pendingRecords = await getData(db, `
      SELECT * FROM pending_sync 
      WHERE synced = 0 
      ORDER BY created_at ASC
      LIMIT 10
    `);
    
    for (const record of pendingRecords) {
      try {
        // Procesar cada registro pendiente
        const data = JSON.parse(record.data);
        
        // Intentar sincronizar según el tipo de operación
        let syncSuccess = false;
        switch (record.table_name) {
          case 'movimientos':
            // Implementar lógica específica para movimientos
            if (data.tipo && data.descripcion && data.monto) {
              const result = await registerMovement({
                cajaId: data.cajaId || 1,
                tipo: data.tipo,
                descripcion: data.descripcion,
                monto: data.monto
              });
              syncSuccess = !!result;
            }
            break;
          case 'pagos':
            // Implementar lógica para pagos
            if (data.nombre && data.email && data.monto) {
              const result = await createPay({
                name: data.nombre,
                email: data.email,
                monto: data.monto
              });
              syncSuccess = result?.success;
            }
            break;
          default:
            console.log(`Tabla ${record.table_name} no soportada para sincronización`);
        }
        
        if (syncSuccess) {
          // Marcar como sincronizado
          await updateData(db, 'pending_sync', {
            id: record.id,
            synced: 1,
            sync_attempts: (record.sync_attempts || 0) + 1
          });
        } else {
          // Incrementar contador de intentos
          await updateData(db, 'pending_sync', {
            id: record.id,
            sync_attempts: (record.sync_attempts || 0) + 1
          });
        }
        
      } catch (error) {
        // Incrementar contador de intentos en caso de error
        try {
          await updateData(db, 'pending_sync', {
            id: record.id,
            sync_attempts: (record.sync_attempts || 0) + 1
          });
        } catch (updateError) {
          console.error('Error actualizando intentos de sincronización:', updateError);
        }
        
        console.error('Error sincronizando registro:', error);
      }
    }
    
    return true;
  }
  
  static async checkAndSync() {
    const isConnected = await checkConnection();
    if (isConnected) {
      await this.syncPendingRecords();
    }
  }
  
  // Función para verificar el estado de conexión
  static async getConnectionStatus() {
    const netInfo = await NetInfo.fetch();
    return netInfo.isConnected;
  }
}

export default SyncService;