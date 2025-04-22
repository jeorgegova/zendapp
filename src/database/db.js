import { enablePromise, openDatabase } from 'react-native-sqlite-storage';
/* import { EventEmitter } from 'events'; */

enablePromise(true);

export async function getDbConnection() {
  const db = openDatabase({
    name: 'Zendapp.db',
    createFromLocation: 1,
  });
  return db;
}

/* const dbEventEmitter = new EventEmitter();

export function addDbChangeListener(callback) {
  dbEventEmitter.on('db-change', callback);
  return () => dbEventEmitter.off('db-change', callback);
}

function notifyDbChange() {
  dbEventEmitter.emit('db-change');
} */

export async function createTables(db) {
  /*const query =
    'CREATE TABLE ordenTrabajoPDA ( 
        id INTEGER primary key autoincrement UNIQUE,estado TEXT,consecutivoTransmision INTEGER,idOrden INTEGER,cuenta TEXT,propietario TEXT,departamento TEXT,
        municipio TEXT,ubicacion TEXT,direccion TEXT,claseServicio TEXT,estrato TEXT,idNodo TEXT,ruta TEXT,estadoCuenta TEXT,fechaAtencion TEXT,horaIni TEXT,
        horaFin TEXT,pda TEXT,estadoOrdenTrabajo TEXT,observacionTrabajo TEXT,observacionPad TEXT,usuario TEXT,fechaHoraEstado TEXT,fechaVencimiento TEXT,
        tipo TEXT,registrado INTEGER,codigoApertura TEXT,solicitud TEXT,bodega TEXT,horaInicialAtiende TEXT,horaFinalAtiende TEXT,personaAtiende TEXT,telefonoPersonaAtiende TEXT,
        codigoPrograma TEXT,industria TEXT,procedencia TEXT,grupoTrabajo TEXT,contratista TEXT,tipoOrden INTEGER,validacion TEXT,ciclo TEXT,meses_deuda TEXT,claseSolicitud TEXT,
        tipoSolicitud TEXT,dependencia TEXT,tipoAccion TEXT,dependenciaAsignada TEXT,consecutivoAccion TEXT,cargaInstalada TEXT,cargaContratada TEXT,campana TEXT,cobroMo TEXT,
        cobroMat TEXT,capacidad TEXT,actividadCiiu TEXT,nivelTension TEXT,propiedad TEXT,barrioVereda TEXT,antiguedad TEXT,codigoDescarga TEXT,fechaDescarga TEXT,pqr TEXT,
        causa TEXT,usuarioGenero TEXT,telefono TEXT,circuito TEXT,sector TEXT,saldo TEXT,mesDeuda TEXT,observacionLectura TEXT,ultimaLectura TEXT,fechaLectura TEXT,
        ultimoConsumo TEXT,x TEXT,y TEXT,z TEXT,pintadoApoyo TEXT,usoPredio TEXT,reglaOro TEXT,serieMedidor TEXT,tipoRed TEXT,planeador TEXT,programa TEXT,nombrePrograma TEXT,
        serie TEXT,tipoUsuario TEXT,subestacion TEXT,nodoTransformador TEXT,nodoAcometida TEXT
      )';
  return db.executeSql(query);*/
}

export async function initDatabase() {
  const db = await getDbConnection();
  console.log("getDbConnection", db)
  await createTables(db);
  db.close();
}

export async function getData(db, query) {
  //console.log("getData query",query)
  if (query.toLowerCase().indexOf('select') != -1) {
    const resultData = [];
    const results = await db.executeSql(query);
    results.forEach(function (result) {
      for (let i = 0; i < result.rows.length; i++) {
        resultData.push(result.rows.item(i));
      }
    });
    return resultData;
  }
  return null;
}

export async function insertData(db, table, data) {
  //console.log("ingreso al insert data", table, data)
  const campos = Object.keys(data[0])
  const strcampos = campos.toString()
  //console.log("strcampos",strcampos)
  let scriptInsert = `INSERT INTO ${table} (${strcampos})`;
  let scriptValues = ' VALUES ';
  for (let index = 0; index < data.length; index++) {
    const element = data[index];
    const _item = Object.values(element)
    scriptValues += "("
    for (let index_value = 0; index_value < _item.length; index_value++) {
      scriptValues += "'" + _item[index_value] + "'";
      if (index_value != _item.length - 1) {
        scriptValues += ',';
      }
    }
    scriptValues += ")"
    if (index != data.length - 1) {
      scriptValues += ',';
    }
  }
  if (table == 'pagos') {
    //console.log('lo que se va en el db.executeSQL', (scriptInsert + scriptValues))
  }

  notifyDbChange();
  return db.executeSql(scriptInsert + scriptValues);
}

export async function insertOrRemplaceData(db, table, data) {
  const campos = Object.keys(data[0]);
  const strcampos = campos.toString();
  let scriptInsert = `INSERT OR REPLACE INTO ${table} (${strcampos})`;
  let scriptValues = " VALUES ";

  for (let index = 0; index < data.length; index++) {
    const element = data[index];
    const _item = Object.values(element);
    scriptValues += "(";
    for (let index_value = 0; index_value < _item.length; index_value++) {
      scriptValues += _item[index_value] === null || _item[index_value] === undefined ? "NULL" : `'${_item[index_value]}'`;
      if (index_value != _item.length - 1) {
        scriptValues += ",";
      }
    }
    scriptValues += ")";
    if (index != data.length - 1) {
      scriptValues += ",";
    }
  }
  if(table == 'pagos'){
    console.log('insert pagos', scriptInsert + scriptValues);
  }

  
  notifyDbChange();
  return db.executeSql(scriptInsert + scriptValues);
}


export async function insertTables(db, table, data) {
  /* console.log("insertTables ", data); */
  const campos = Object.keys(data[0])
  const strcampos = campos.toString()
  let scriptInsert = `INSERT INTO ${table} (${strcampos})`;
  let scriptValues = ' VALUES ';
  for (let index = 0; index < data.length; index++) {
    const element = data[index];
    const _item = Object.values(element)
    scriptValues += "("
    //
    for (let index_value = 0; index_value < _item.length; index_value++) {

      if (typeof _item[index_value] === 'object') {
        //console.log("ingreso al objeto",_item[index_value])
        scriptValues += `'${JSON.stringify(_item[index_value])}'`;
      } else {
        scriptValues += "'" + _item[index_value] + "'";
      }

      if (index_value != _item.length - 1) {
        scriptValues += ',';
      }
    }

    scriptValues += ")"
    if (index != data.length - 1) {
      scriptValues += ',';
    }
  }
  if (table == 'detallesCaja') {
    //console.log("scriptInsert + scriptValues----------",scriptInsert + scriptValues)

  }
  notifyDbChange();
  return db.executeSql(scriptInsert + scriptValues);
}

export async function updateData(db, table, data) {
  if (data.id != undefined) {
    let { id, ...all } = data;
    const dataArray = Object.entries(all);
    let scriptUpdate = `UPDATE ${table} SET `;
    for (let index = 0; index < dataArray.length; index++) {
      const element = dataArray[index];
      scriptUpdate += element[0] + ' = ' + "'" + element[1] + "'";
      if (index != dataArray.length - 1) {
        scriptUpdate += ',';
      }
    }
    scriptUpdate += ` WHERE id= ${id}`;

    if (table == 'consecutivoTramitado') {      
      console.log("script de actualizacin",scriptUpdate)
    }

    notifyDbChange();
    return db.executeSql(scriptUpdate);
  }
  return null;
}

export async function updateDataOdoo(db, table, data) {
  console.log("updateDataOdoo", table, data);

  // Asegúrate de que el id y idv estén presentes en el objeto data
  if (data.id !== undefined && data.idv !== undefined) {
    const { id, idv, ...all } = data;

    // Verificar si el registro con el id ya existe
    const checkQuery = `SELECT COUNT(*) as count FROM ${table} WHERE id = ${id}`;

    try {
      const result = await db.executeSql(checkQuery);
      const count = result[0].rows.item(0).count;
      console.log('checkQuery registro......', count);

      if (count > 0) {
        console.log(`El registro con id ${id} ya existe. Se eliminará el registro con idv ${idv}.`);

        // Eliminar el registro con idv
        console.log('Eliminando registro......', idv);

        const deleteQuery = `DELETE FROM ${table} WHERE id = ${idv}`;
        await db.executeSql(deleteQuery);
        notifyDbChange();
        return null;
      }
    } catch (err) {
      console.log("Error al verificar la existencia del registro:", err);
      return;
    }

    // Proceder con la actualización
    const dataArray = Object.entries(all);
    let scriptUpdate = `UPDATE ${table} SET `;

    // Agregar el id a la consulta de actualización
    scriptUpdate += `id = ${id}, `; // Agregar el nuevo id

    for (let index = 0; index < dataArray.length; index++) {
      const [key, value] = dataArray[index]; // Desestructurar el par clave-valor
      scriptUpdate += `${key} = '${value}'`; // Agregar la propiedad y su valor
      if (index !== dataArray.length - 1) {
        scriptUpdate += ', '; // Agregar coma si no es el último elemento
      }
    }

    scriptUpdate += ` WHERE id = ${idv}`; // Usar idv para la cláusula WHERE

    console.log("script de update", scriptUpdate);
    try {
      return await db.executeSql(scriptUpdate);
    } catch (err) {
      console.log("Error en update de odoo:", err);

      // Solo intenta eliminar si el error es por violación de la restricción de unicidad
      if (err.message.includes("UNIQUE constraint failed")) {
        console.log(`Intentando eliminar el registro con idv ${idv} debido a un error de unicidad.`);
        const deleteQuery = `DELETE FROM ${table} WHERE id = ${idv}`;
        try {
          await db.executeSql(deleteQuery);
          console.log(`Registro con id ${idv} eliminado exitosamente.`);
        } catch (deleteErr) {
          console.log("Error al eliminar el registro:", deleteErr);
        }
      }
      return;
    }
  }

  return null; // Si no hay id o idv, no se hace nada
}


export async function deleteDataTable(db, table) {
  const insertQuery = `DELETE FROM ${table}`;
  notifyDbChange();
  return db.executeSql(insertQuery);
}
