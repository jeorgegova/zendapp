import { supabase } from "../lib/supabase";

export const registerMovement = async ({ cajaId, tipo, descripcion, monto }) => {
    try {
        const { data, error } = await supabase
        .from('cash_movements')
        .insert([
          {
            caja_id: cajaId,
            tipo, // 'ingreso' o 'egreso'
            descripcion,
            monto,
          }
        ]);
    
      if (error) {
        console.error('Error al registrar movimiento:', error.message);
        throw error;
      }
    
      return data;
    } catch (error) {
        console.error("Error inesperado:", error);
        return null;
    }
}


export const openBox = async ({ usuarioId, montoInicial }) => {
    const { data, error } = await supabase
      .from('cajas')
      .insert([
        {
          usuario_id: usuarioId,
          monto_inicial: montoInicial,
          estado: 'abierta',
        }
      ])
      .select()
      .single(); // para devolver solo un objeto, no un array
  
    if (error) {
      console.error('Error al abrir caja:', error.message);
      throw error;
    }
  
    return data; // contiene el registro recién creado, incluido el ID de la caja
  };

  export const closeBox = async (cajaId) => {
    // 1. Sumar todos los movimientos para calcular el monto final
    const { data: movimientos, error: movimientosError } = await supabase
      .from('cash_movements')
      .select('monto')
      .eq('caja_id', cajaId);
  
    if (movimientosError) {
      console.error('Error al obtener movimientos:', movimientosError.message);
      throw movimientosError;
    }
  
    const montoFinal = movimientos.reduce((total, mov) => total + mov.monto, 0);
  
    // 2. Actualizar caja
    const { data, error } = await supabase
      .from('cajas')
      .update({
        estado: 'cerrada',
        fecha_cierre: new Date().toISOString(),
        monto_final: montoFinal,
      })
      .eq('id', cajaId)
      .select()
      .single();
  
    if (error) {
      console.error('Error al cerrar caja:', error.message);
      throw error;
    }
  
    return data;
  };
  

export const createClientInvoice = async ({ name, email, monto }) => {
  try {
    // Paso 1: Crear cliente
    const { data: cliente, error: errorCliente } = await supabase
      .from('clients')
      .insert([{ name, email }])
      .select()
      .single();

    if (errorCliente) throw errorCliente;

    // Paso 2: Crear factura relacionada
    const { error: errorFactura } = await supabase
      .from('invoice')
      .insert([{
        client_id: cliente.id,
        amount: monto
      }]);

    if (errorFactura) throw errorFactura;

    console.log('Cliente y factura creados con éxito');
  } catch (error) {
    console.error('Error:', error.message);
  }
};


export const createPay = async ({ name, email, monto }) => {
  try {
    // 1. Crear cliente
    const { data: cliente, error: errorCliente } = await supabase
      .from('clients')
      .insert([{ name, email }])
      .select()
      .single();
    if (errorCliente) throw errorCliente;

    // 2. Crear factura
    const { data: factura, error: errorFactura } = await supabase
      .from('invoice')
      .insert([{ client_id: cliente.id, amount: parseFloat(monto) }])
      .select()
      .single();
    if (errorFactura) throw errorFactura;

    // 3. Obtener caja abierta
    const { data: cajaAbierta, error: errorCaja } = await supabase
      .from('cash_register')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single();
    if (errorCaja || !cajaAbierta) throw new Error('No hay caja abierta');

    // 4. Obtener último movimiento de caja
    const { data: movimiento, error: errorMov } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('cash_register_id', cajaAbierta.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (errorMov || !movimiento) throw new Error('No hay movimiento de caja activo');

    // 5. Crear pago
    const { error: errorPago } = await supabase
      .from('payments')
      .insert([{
        client_id: cliente.id,
        invoice_id: factura.id,
        cash_register_id: cajaAbierta.id,
        cash_movement_id: movimiento.id,
        amount: parseFloat(monto)
      }]);
    if (errorPago) throw errorPago;

    return { success: true };
  } catch (error) {
    console.error('Error creando cliente, factura y pago:', error.message);
    return { success: false, error: error.message };
  }
};
