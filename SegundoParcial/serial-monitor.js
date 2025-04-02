const serialport = require("serialport");
const { ReadlineParser } = require('@serialport/parser-readline');
const fs = require('node:fs');

class PLC {
    constructor() {
       this._sonico = false;
       this._fotoresistencia = false;
       this._temperatura = 0.0;
       this._humedad = 0.0;
       this._ledultra = false;
       this._tiraled = [false, false, false, false, false, false, false, false, false, false];
       this._buzzer = false;
       this._rfid = "";
    }

    FormData(data){
        let arrData = data.split(",");
        this._sonico = arrData[0] == "1" ? true : false;
        this._fotoresistencia = arrData[1] == "1" ? true : false;
        this._temperatura = parseFloat(arrData[2]);
        this._humedad = parseFloat(arrData[3]);
        this._ledultra = arrData[4] == "1" ? true : false;
        this._tiraled = arrData[5].split("").map(Number);
        this._buzzer = arrData[6] == "1" ? true : false;
        this._rfid = arrData[7];
    }
    
    ToData(){
        let arrData = [
            this._sonico ? "1" : "0",
            this._fotoresistencia ? "1" : "0",
            this._temperatura.toString(),
            this._humedad.toString(),
            this._ledultra ? "1" : "0",
            this._tiraled.join(""),
            this._buzzer ? "1" : "0",
            this._rfid
        ];
        return arrData.join(",");
    }
}

// Puertos de comunicación
const port = new serialport.SerialPort({path: "COM1", baudRate: 9600, autoOpen: false});

port.on("error", (err) => {
    console.log("Error: ", err.message);
});

port.open();

const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
parser.on('data', (data) => {
    console.log(`Received data: ${data}`);
    let timestamp = new Date().getTime();
    let plc = new PLC();
    plc.FormData(data);
    let prsdata = plc.ToData();
    console.log("Data prs: " + prsdata);
    fs.appendFile('file.log', timestamp+":"+prsdata+"\n", err => {
        if (err) {
          console.error(err);
        }
      });
});

port.close()