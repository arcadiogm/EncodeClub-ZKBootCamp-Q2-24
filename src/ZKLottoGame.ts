/**
 * This file defines the `LottoGame` smart contract and the helpers it needs.
 */

import {
  Field,
  State,
  PublicKey,
  SmartContract,
  Reducer,
  state,
  method,
  Bool,
  Provable,
  Signature,
  Struct,
  UInt64,
  MerkleTree,
  MerkleMap,
  Poseidon,
  Experimental,
  MerkleWitness,
} from 'o1js';

export { LottoNumbers, GameBoard, ZKLottoGame };


export class MerkleWitness4 extends MerkleWitness(4) {}
export class MerkleWitness8 extends MerkleWitness(8) {}
export class MerkleWitness16 extends MerkleWitness(16) {}
export class MerkleWitness24 extends MerkleWitness(24) {}
export class MerkleWitness32 extends MerkleWitness(32) {}
export class MerkleWitness64 extends MerkleWitness(64) {}
export class MerkleWitness128 extends MerkleWitness(128) {}
export class MerkleWitness256 extends MerkleWitness(256) {}


  
  // ==============================================================================

  export type Update = {
    leaf: Field[];
    leafIsEmpty: Bool;
    newLeaf: Field[];
    newLeafIsEmpty: Bool;
    leafWitness: MerkleWitness8;
  };
  
  export const assertRootUpdateValid = (
    serverPublicKey: PublicKey,
    rootNumber: Field,
    root: Field,
    updates: Update[],
    storedNewRootNumber: Field,
    storedNewRootSignature: Signature
  ) => {
    let emptyLeaf = Field(0);
  
    var currentRoot = root;
    for (var i = 0; i < updates.length; i++) {
      const { leaf, leafIsEmpty, newLeaf, newLeafIsEmpty, leafWitness } =
        updates[i];
  
      // check the root is starting from the correct state
      let leafHash = Provable.if(leafIsEmpty, emptyLeaf, Poseidon.hash(leaf));
      leafWitness.calculateRoot(leafHash).assertEquals(currentRoot);
  
      // calculate the new root after setting the leaf
      let newLeafHash = Provable.if(
        newLeafIsEmpty,
        emptyLeaf,
        Poseidon.hash(newLeaf)
      );
      currentRoot = leafWitness.calculateRoot(newLeafHash);
    }
  
    const storedNewRoot = currentRoot;
  
    // check the server is storing the stored new root
    storedNewRootSignature
      .verify(serverPublicKey, [storedNewRoot, storedNewRootNumber])
      .assertTrue();
    rootNumber.assertLessThan(storedNewRootNumber);
  
    return storedNewRoot;
  };


  // ==============================================================================

  class GameBoard extends Struct({
    gmWeek: Field,
    startTime: UInt64,
    endTime: UInt64,
    gameStatus: Bool,
  }) {
    static from(gmWeek: Field, startTime: UInt64, endTime: UInt64, gameStatus: Bool) {
      return new GameBoard({ gmWeek: gmWeek, startTime: startTime, endTime: endTime, gameStatus: gameStatus});
    }
  
  }

  function Optional<T>(type: Provable<T>) {
    return class Optional_ extends Struct({ isSome: Bool, value: type }) {
      constructor(isSome: boolean | Bool, value: T) {
        super({ isSome: Bool(isSome), value });
      }
  
      toFields() {
        return Optional_.toFields(this);
      }
    };
  }
  
  class OptionalBool extends Optional(GameBoard) {}



// class for creating the new Lotto Game Board
// class Lotto {
//   lottogame: OptionalBool[];
  

//   constructor() {
//     let lottogame = [];
    
//     const gmWeek = Field(0);
//     const startTime = new UInt64(0);
//     const endTime = new UInt64(0);
//     const gameStatus = Bool(false);
    

//     const gameBoard =  GameBoard.from(gmWeek, startTime, endTime, gameStatus);
//     const GameOption = (new OptionalBool(gameStatus, gameBoard));

//     lottogame.push(GameOption);
//     this.lottogame = lottogame;
//     }
 

//   startNewLotto(
//     gmWeek: Field,
//     startTime: UInt64,
//     endTime: UInt64,
//     gameStatus: Bool,
//   ) {
//     const gameBoard =  GameBoard.from(gmWeek, startTime, endTime, gameStatus);
//     for (let i = 1; i < 4; i++) {
//       const toUpdate = gmWeek.equals(new Field(i));

//       toUpdate.and(this.lottogame[i].isSome).assertEquals(false);

//       // copy the game board (or update if new game is to start)
//       this.lottogame[i] = Provable.if(
//         toUpdate,
//         new OptionalBool(true, gameBoard),
//         this.lottogame[i]
//       );
//     }

    
//   }

  
// }

class LottoNumbers extends Struct({
  gmWeek: Field,
  value: Provable.Array(Field, 6),
}) {
  static from(gmWeek: Field, value: Field[]) {
    return new LottoNumbers({ gmWeek: gmWeek, value: value.map((row) => row) });
  }

  hash() {
    const numbersHash = Poseidon.hash(this.value.flat());
    return Poseidon.hash([this.gmWeek, numbersHash]);
  }
}

class LottoWinningHistory extends Struct({
  value: Provable.Array(Provable.Array(Field, 52), 6),
}) {
  static from(value: Field[][]) {
    return new LottoWinningHistory({ value: value.map((row) => row.map(Field)) });
  }
}

class ZKLottoGame extends SmartContract {
  // The board is serialized as a single field element
  @state(Field) lottoboard = State<GameBoard>();

  //lotto game states
  @state(Bool) lottoGameDone = State<Bool>();
  @state(Field) lottogameWeek = State<Field>();
  @state(Field) currentGameTimeStart = State<UInt64>();
  @state(Field) currentGameTimeEnd = State<UInt64>();
  @state(Field) gameduration = State<UInt64>();

  //Lotto Winning numbers Details
  @state(Field) LottoWeekWinningNumbers = State<LottoNumbers>();
  @state(Field) LottoWinHistory = State<LottoNumbers[]>();
  @state(Field) LottoWinHash = State<Field>();

  
  @state(Field) storageTreeRoot = State<Field>();


  init() {
    super.init();
    this.lottoGameDone.set(Bool(true));
    this.lottogameWeek.set(Field(0));
    this.currentGameTimeStart.set(UInt64.from(0));
    this.currentGameTimeEnd.set(this.network.timestamp.get());
    this.gameduration.set(UInt64.from(518400)); //game duration is 6 days, winning lotto numbers generated on day 7
    //initiate gameRoot
    const emptyTreeRoot = new MerkleTree(8).getRoot();
    this.storageTreeRoot.set(emptyTreeRoot);
  }

  @method async startLottoWeek() {
    //start lotto game week by increasing by 1 week
    //ensure current game week is at least 1 week past previous game week
    const currentGameTimeStart = this.currentGameTimeStart.get();
    this.network.timestamp.get().assertGreaterThan(currentGameTimeStart.add(86400));
    this.currentGameTimeStart.set(this.network.timestamp.get())
    //game ends 6 days after new game start. //could round-up timestamp to the hour
    const newGameEndTime = this.currentGameTimeStart.get().add(this.gameduration.get());
    this.currentGameTimeEnd.set(newGameEndTime);

    // you can only start a new game if the current game is done
    this.lottoGameDone.requireEquals(Bool(true));
    this.lottoGameDone.set(Bool(false));
    
    //set new game week
    let gameWeek = this.lottogameWeek.get();
    this.lottogameWeek.requireEquals(gameWeek);
    gameWeek = gameWeek.add(Field(1));
    this.lottogameWeek.set(gameWeek);

    
    

    /*Create New Lotto Week, start the new lotto for the week
    This section to start the timer for the new Lotto Game week, should display the Week No. and Countdown
    */
    this.lottoboard.requireEquals(this.lottoboard.get());
    //this is for the demo. Production would require creating a new board each game week
    const gameBoard =  GameBoard.from(
      gameWeek,
      this.currentGameTimeStart.get(),
      this.currentGameTimeEnd.get(),
      this.lottoGameDone.get()
    );
    this.lottoboard.set(gameBoard);

    /*let lottoboard = new Lotto(this.lottoboard.get());
    lottoboard.startNewLotto(
      gameWeek,
      this.currentGameTimeStart,
      this.currentGameTimeEnd, this.lottoGameDone) (gameWeek, Bool(true));
      this.lottoboard.set(lottoboard.serialize());
    */
    
  }

  @method async endLottoWeek(winningNums: LottoNumbers) {
    //start lotto game week by increasing by 1 week
    //ensure current game week is at least 1 week past previous game week
    const currentGameTimeEnd = this.currentGameTimeEnd.get();
    this.network.timestamp.get().assertGreaterThanOrEqual(currentGameTimeEnd);

    //end GameWeek
    this.lottoGameDone.requireEquals(Bool(false));
    this.lottoGameDone.set(Bool(true));

    /*generate lotto winning numbers
    random six numbers and set as Field array
    Ideally, we are to a more secure verifiable means to generate the winning numbers
    possibly using VRF. But for this PoC, we manually set the winning numbers
    */
    
    // verify the lotto week to end is same as current week
    this.lottogameWeek.requireEquals(winningNums.gmWeek);
    //set winning details
    this.LottoWeekWinningNumbers.set(winningNums);
    
    //add to winning game lotto numbers array
    const winHistory = this.LottoWinHistory.get();
    winHistory.push(winningNums);
    
    
    // this.LottoWeekWinningNumbers.set(winningHash);
    
    //@notice MerkleMap might be a better option?
    //hash week winning numbers and set to LottoWinHash
    this.LottoWinHash.requireEquals(this.LottoWinHash.get());
    const winningHash = winningNums.hash();
    this.LottoWinHash.set(winningHash);

  }

  // Lotto Game:
  //  ----   ----    ----   ----     ----   ----
  // | X  | | X  |  | X  | | X  |   | X  | | X  |
  //  ----   ----    ----   ----     ----   ----

  @method async play(
    pubkey: PublicKey,
    signature: Signature,
    week_: Field,
    lottoEntry: LottoNumbers,
  ) {
    //require game week is active
    this.lottogameWeek.requireEquals(week_);
    this.lottoGameDone.requireEquals(Bool(false));

    
    //verify lotto entry is signed by user
    const lottoEntryHash = lottoEntry.hash();
    const newLeaf = pubkey.toGroup().toFields().concat(lottoEntryHash.toFields());
    signature.verify(pubkey, newLeaf).assertTrue();

    /*TO-DO
    add user's lotto numbers entry to merkleTree for the Game week
    */



    // const storedRoot = this.storageTreeRoot.get();
    // this.storageTreeRoot.requireEquals(storedRoot);
    // const emptyTreeRoot = new MerkleTree(8).getRoot();
    // const priorLeafIsEmpty = storedRoot.equals(emptyTreeRoot);

    // // we initialize a new Merkle Tree with height 8
    // const Tree = new MerkleTree(8);
    


  }

  @method async ClaimWinning(
    pubkey: PublicKey,
    signature: Signature,
    path: MerkleWitness8,
    week_: Field,
    winningNums: LottoNumbers,
  ) {
    //proof user is winner of the claim week's lotto


    //transfer winnings to user after successful proof verification
   
  }
}
