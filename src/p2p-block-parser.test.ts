/**
 * Network-free tests for the P2P block/transaction parser and wire codec.
 *
 * Fixtures were captured from a `naviod -chain=blsctregtest` node during
 * scripts/test-p2p-regtest.ts: a wallet payment made by the node and the
 * BLSCT transaction the SDK built and broadcast in reply. Expected hashes are
 * the node's own `getrawtransaction` / `sendtoblsctaddress` values.
 */

import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { computeTxid, parseBlock, parseOutputHex, parseTransaction } from './p2p-block-parser';
import { InvType, P2PClient } from './p2p-protocol';

/** Node wallet -> SDK payment (txid from getrawmempool, hex from getrawtransaction) */
const NODE_TX_ID = 'ff05b88f56917b819092e632f692c32f5ca51fdf99b08c40e7fd7cb492d374fd';
/** Output hash sendtoblsctaddress returned for the recipient output */
const NODE_TX_RECIPIENT_OUTPUT_HASH =
  'eefad98a86b417249e42d69f5a26976f6705066b02afca322df36ee7e3d34eb5';
const NODE_TX_HEX =
  '6200000001801121e6419f46f08052289f4513b4bc8401074e117ac713c8fccc8503acbebe00ffffffff03ffffffffff' +
  'ffff7f0c000000000000004598040000000000016a31039955e950cb99c9de6e88f26e701d10a0678e0f0fedad65c5e9' +
  '63ec1f562f8c8789d2e2811e0a458a3ac05fd6da8420ccffffffffffffff7f0100000000000000015101abbfea9e1ec4' +
  '1a20f0215d4dc575f1c382b8bae3d5f557e75922eb65f933c111f5007e4e7a6db9fb7208b2ced315ce6406b578e5e619' +
  'b69d392e0da7dfbcef48056fea531c9b50c7e5ca9b1c442d7ca452ff40dc93c609b20843da55445512a18ab904190fef' +
  '423e32718b6623e7b7b1538b53cfdb7d20932939b619e5d16ed5d37deb5f2cecf88b634008be19d782637593d1de0983' +
  'fbcf4791b9c564f5179a9c86a2adaa81ad130e0828cea33c10446cf1fe02a554eddb7302637c410de23443844e838025' +
  'c999687f3af991dacec030555c138c64ebf1c13c84a481620bca8df982fa248c489d0cca9a24203d62875880accc80cd' +
  'ec1069d81f61a5a4dec5e07294ea7d1f020a66378ff98bdfcc4d9dd3a566bd963961b1c0ada621705ec9d38a5b4e4a40' +
  '1964d45a66ccb5c0e66fbfb8691ce51f78fa8095986362f00e6265dc774491e9c9c7e726f49a133df9cf97069742f8cc' +
  '8673323d8ebb87e7d87d7c9ca0ca9dec9ed8fdd85bc094dc8e3eacc262e0c334b11306990dad29f733876d4ead769212' +
  '21739cba84a05aa7c798de957bd490cad389d3c53f0551f0d420f266cb1adf157d50d87e355db6fda3e7edeba2ba4c44' +
  '98f8f51b2e79981d1a566cbf40fe7f1e21c16e2373175f1adb146f0da4184c20d30934e435a6e03fb6591f5e92d9b761' +
  '7d3b39d8e22426802002924f408201ed021f2286760b6f7f807849a59fd524115d66fcd6a5c81982161bad3d890b2ae8' +
  '6900e08405d4faa29664af3791e15f73aad47b1c1ca102b8569e8e0fd3c8ef1729f50710487aff0fb5ad93208e73405f' +
  '9cdbbe7135a585389ac0416950ea359f035df8d90b2feee402c1daf01074df2ec7c90a2a81b053db475ff05481812ecc' +
  'd3773aa8aed279ef32f57cc5b8cc33ed2957d6c16f7f7a5fc25a60fa364795906b3c16dabcfc4e94d149c393a7728027' +
  'b7effac77f2f0c7489724617e1b5b3712f9aea9598a644debd3c415fd9b0ddf807b77168518a15be2a271f95ab56904e' +
  'be5acc2091c341e8705da4fc7526f4bba69eecd23891c5c502b9b4a9dbc9662bd08c183ece146b6ee2fd2eb416b45c81' +
  'e95e99d157b23643e1f9e119643fdb5b2d25451a8b96f9b2442bc28a0e99ab61c35914ae5268b92393cfc73e7068b8ef' +
  '780ea82c69e6204391a1d5ea1f0430d01e70b47a01b5af4738cee226507e9d30a37471a2ca2daddda922061e31bb40f0' +
  '810b5e1fb398e1a5ac0f28c9a66a5c2b7e9f2354c92d9152d722a35c23ba6b2e186b370e0ce7035825c5025d373a5ea3' +
  'fa497bb5b69640c3096ad8d0ab2ca8dc97594eeb2b6fba88a45604675d8d82daf22c8aea8edee76459ac2d27e2250b36' +
  '1f621f1917d122282c48fe9ba81a5cf7ac4539d0ad64688d06491a34c915417414a335211652a871e5384a9926ed3550' +
  'eb2a4a18a5546c17752202ae8dcfd5a9d3e6574c57941fc3b34c9ce6b1e10c7155d07b3cd69475f1c74fba0652b5c12d' +
  '5ed1bd887e2177f2dc4060443d30ffffffffffffff7f0100000000000000015101b6d364df5854266e2299c2d5f1ca76' +
  '9010e05fc970cece69db19f990159f130dab64a9ca07101fa2c5d48f35249b670406b5ac265f701c6ad27c894403668f' +
  '445957780f5dca2c52d73288d965621d21ccd7870f9bd4cf1a09e8337784e348f0e793932aef76165417be034d2dc829' +
  '426c168cebfba156a631ec25d874758429c76bc62b5638fedb5f3f28c0f3a013b6408e82290173513dfd1665ce56897e' +
  '04284df77470a1573567a467083190760b5041df5c94b9f908d092a707f8a143fd5489085fb122df2d8b7cd6b6df4e0a' +
  'd43cff157bfafb88cc63f17a0c631458fbd2fcb956cc30f32c5f6d2206264469b140b5403462f30afbb69bf890bbac31' +
  '16164d20babae33721e446ac563d990aa6b2094dec83ce4315af4ef7fbc460a5257fa1cf108e1954b8f86167e819d3bf' +
  '296dde494fd499faa3ad1b9d61a1956bec8e4e43077967128a69e78c1a9f9f5fe05c068085a9fbd8a18985e1c04d91fb' +
  'ca6a3d90c328209599e387d8dee6db8cdcb76f1cc9e5b7c1a286bc54594d9fe230f5c1b1ab151b14694dc6f2baf0d545' +
  'f5a79895030ab5ea863be90aefae484622d55e519ccd88257d09ad6b8e8acaca9f987585e66014874b8e2ddb6c18f20e' +
  '05e5c43398406ba459b8e3e558b387cd986e53955fd17d8e320ffac05fc1918162c4e8abb73a263395c26c898b1971da' +
  'd5c26ec85518eadc143b56d90b2b9eae556860b38b788dd4ef09a115d6efb5c350f9f4954dc54a6c57eeb13a255ae669' +
  '804b319d04ab57f9f582717894383e824c2dfa18b49049b89acc31f5c4424cc6373fe98a3998b726ce11dcf4a9a0bd0b' +
  '2e32d204014c9bcbf1fd8b9a29c2b9738eb0584fe2860f076c3750d8094a8f3bee9375a6d46498de7f8787e397c8deed' +
  'e8e446a6ab776620b757c9d665698fe37817ec8f1312931e7fdb1d1d06fdfe8c9087efa7e0a35aa62c6cb989c86e97ef' +
  'e7202471a00d07cc2bcb37e9a57525578f8689c0dcb73561e4685b12aa2cc041d4f0bbaea6ac26b18e3b610b1c0c0491' +
  'c2927c3aa9c29a4565f653e81220fefd218973b66f106582376f94352d3bb12c38f22b66fc15ab61930568895256bd59' +
  'e8dd2548a1295a61296cacd5b1ee9927b0e7980dae071b234018c1433b35451b727dede73a7c7a88d24a298b91295f17' +
  'aed76340a4fba35e3ef1711caf1a633663f70181998c62263b8efa5c19171fc9e9485152281d1ce695b18f3e0bcc17ce' +
  'b251d0ad0cbda6649a625767c374f20ea5c63b4c250471cac3322b6488dce385850f45161c3583f703b1222cd38b480f' +
  '131f1795db6e87e2e14350b92a4ea5273fa3d2f952933924b6f61876f1aea73860f36d0cd7bbec6875d0242cc2307b35' +
  '48344084dc510e96c42390bc96b435c711af7ef39a220e7fb631ea33b1a29a54aef24d327bf8a1848b23830c8e4bbbf4' +
  '18dceab5a3133d918bf7d2f39a4ba0630db29217cd7570b4b1a3b19e9dd9c7f511000e57ebebb2e7c47c78464e7519be' +
  'b91f5f1d5300000000b588bca645c5ae3329d2f031968d6f0c0e94c37d9b074654eb3852dc5fa8c043552fa8e0c95251' +
  'add0eb5e5de4af622b0a1c1a24465a38c2be6e0669f5692569dc800040269498d593ca22e7683ce9172d89315ab84f05' +
  '9e16e48fe901b41d4f';

/** SDK-built spend of that output (txid from CTx.getCTxId, confirmed by the node) */
const SDK_TX_ID = 'cd73f2272f8290e96840fc1fe505f85fb75b90bfb74c742b337d5f84337f101d';
const SDK_TX_HEX =
  '6200000001b54ed3e3e76ef32d32caaf026b0605676f97265a9fd6429e2417b4868ad9faee00ffffffff03ffffffffff' +
  'ffff7f0100000000000000015101933be37481141477b2bfb77db176dc059bb570ccb7723d253e75b623169d89c2ff76' +
  '3af1a5a9e008df6c61fd7bbf14bd06abd76b49707adcb582c0a821769b62b755acd3f97d6a90bd18687c774a910956c1' +
  'aed700b5cc214c48f5f565945bf3cc84356caafb050bf0b7588e76440572e14cb1dd58627881654b165bc4d51e023999' +
  '0fc15c3a5a13ab3c7a03aeeb9f24908ef705f05387487f3240f2c0d24bd29422a8839eadbf7dde45b2ab6b3428993130' +
  '293b4ade5b46ba2ca028cafe4b625fa03805779ae8ec92fb17154818b752b18402515c275f8023d2b3c3ab572629aeec' +
  'f85de2ccd85babdc376ad8cf7f6801ae230d32ffc695f7a1f90df30569e87c5e29f4427970dd55165dd801ea23e8fa44' +
  '0f23ca9bbde1055dcf442aacb13ccbb599f149c3a2b243908981be9a464007215871fceb53fbf7300a53cbf702d2603f' +
  '59e5d400fcf727e3b3c6856d4194b106a78ea9c6a03199fbb0aad7152e0949e3e2c05ddffa708154cf3afa3ecb144018' +
  '69d90688f7e52f433b8ff51761a4a904aa2274a04a8378d3d1237c04f10c261c0a4c2bda9f4d8ccfddab4db4da04e648' +
  'd7cc256e6c5467358c9b941ccb00ef3fa0548bbb7b5b7265b182d54192fc63e8502c70ce3ae62af62f803a5728b9ec5a' +
  'ceff990043f1840c9ca858a0a42267f7b821d47ceed1fe8b61dbb933184891bd00ee615f9144adca1a8dff9f519f2cb3' +
  '02c5f19dc344fb6c96d10a18d0a31136b3e029031a6397315a33055d345aad5e147aac6588d95d3864d478c5dd3081d3' +
  'c147568566ce20a38b589827e751fdfba59a0c18201e3f689f362b9dcc4c9d815df96740d49e14585e8c48c48e9066b6' +
  'ecf1ec4eff5faf9f7bd64194a084a0a380967112853b6e9dd5c9429963e105ac340c2a81076935bfe65a93e2fe3af043' +
  '8493c14b0e7ba8b3429604f9d13ab42182d66940a2d0beec245ecc03927b60e4857b88f8b8ed582a227f7414359ff79e' +
  'a83d924b56afd067b23e9448d5726ed0a4e346163aeddbf5804a456f7cfd35b2c56e51626e45f6ff8757ea93ff584809' +
  '6e514e8f3c18f5c3279b9f16c5a1d76f532f5dc3b9a1175dabdacd8da3359bac069b7713f70e7f660c1879c0bd8d6aca' +
  '2912c90e976864d258635429603e889e31b09cbba28eb878ad645563ebeab2912d6b0c92182f7652fde3f33270189bf1' +
  'e20f95ce873de216950e0b8096c8873f1312b1065fbe69180bb50dd1bda08b406609f71010b2e3893cc6872fdad030d5' +
  '377db195c9d5a3490edc222d47536cb774ab092485c153e80ee54de8092a560b804b1a64770a38bf6780316d6a8d7965' +
  'bdfbbe726107ab217b790e95eef3b8c2a853a6c3286f77ff309e3ba7c9c9b34ea8fb3b8e74fa846cd447ea22163b7543' +
  '4cc5b182ff522e8a050e0153adde1e076bcf97a2e4ac668d7fe8ec6559a12057a3510fe512de67ad5b5d80c5821041d0' +
  'e32d21864b971a3059a20529f2ca844b2ddf62de3b71c9cae463c944ef6668bc717affffffffffffff7f010000000000' +
  '0000015101959a3529ff17f2c56940036da4ef725ebf061b21a52db79214e92bee1d182bcb007692b904f722ace47b1a' +
  '2ccda00ea206af12db6661f501ec0e6b14b6e15a9ebed295757d7b93982f20378ab0922f04ecd724683d406cf3ed0f8c' +
  '50415d94c7b9b5744220e76a4c63a2fadde5d852519009e47453c41015741ce1b04fff28a9f01dda3deed1c96e46dd52' +
  '5a9833cb814c913c6bd5fa5c37f89355ceff651536262321c1517e8de19cbd7e178a7d8d35621b317d71f3f2b8af8099' +
  'c22024f9e3cf99c6232683cff3586b76e0eeaca5cbe562bc7cf30c5f818d5ca43e20ffd5cc61fef6f3ce06a5b11f4ee5' +
  '530094600a2aa69faa54a2a599fc6ff4e279d9b36ece5a817cce5f72bc5549b6581d7c17aed279e2ac4c63cd16362123' +
  'e173eb6bbd728267d102b9d888ab00e847ee41cb6c258093a6634c49a73902e3eaba7ca9311886001a2b546a27a03804' +
  '9a9bdcd65ac606b551971cb4db374ee13d9babff5eb634c37045f343fe2c79272518efbcd67b5260ad544314d1f699fe' +
  '7465a6cc651932849266a8c878dbf50244989e6f6aa14a52a6dbeecee93dd7ed7980eb5c9d3994a16536a652f65e9e0a' +
  'b03da52cb9bd888668bc703579943517a9a8aada934690e9d37532727277852ea05a362262a11390ecc31715de5b8228' +
  'b2f9d8da4ec901877a03f578e1b9a97d8a5a7c906d8a105120e8b919c8126c4fb06bca2eefbbc93a75d2dc5002d35a6f' +
  '1b024b8ed0a8c9aeff5e5b1aaff05a04dd2689e90202545d17e636dc825c8ffd0ddc7562fecc8e5904828715f7b5144f' +
  '7ee4ca54a08cf1ae1e620ed72a6cff624591f214a6bc73653868b27ee38f7aaad5b6151ffcdc00f974739f1ea4c497e2' +
  '5f0f52fa997f8e8e58431df871dc2038956102adf8dfa6df396d4612fc36b09f18c1e9abbaa9552caca12b45722d6435' +
  '1381ff12738cfea770806c48028318d5f1b9c2ecb569b4ffbf104b879566dcdd53d2dc03df0ebdc66fb364f213a795b6' +
  'cbf496ef68316db5fbd592340e6a6b1e0ee9b2192610d84fb560c104e90edc5b5c2628aad59ddb688022301d2c7f6e65' +
  '47145154b5967a4689ebff8a9baffea9a505b1fee1e1a733dce2894bcdb21f7c27feaa5271b7b10ac02a2581e6abb703' +
  'f8c95d37a48da6e1bb3b42ccfa4c1099665afd4374a55b0327d0f017499692643f23ad3d4698440d74d278e8072a840e' +
  '1209bd56a01f4d28b8d8849906a43696501f5206111852f951464497ef8b6fb1d9bc20eab0118131e2b56a59cd9ac94a' +
  'ac6728c09ff9bafd36c56b483e4e0ea90a45eb3541ea8b8695abeeaf342d1ced72fa2a43122a139e55b2c938c724edc8' +
  '36b0872c7dec4f04793facf65d37d936fc2f88331ded11ad177449737b5ff338c704c21fe808ca5e1afd6fd586fd2b22' +
  'a1b75e5c1cdc8a11ce359678e94c9efdc5634d6c560ff983881103543c59fc1db18b553d0ed35fd3d6d5a2442479b580' +
  '3222f528b3e19d4a74986604f13426158230091fa33b5d3a59ffffffffffffff7f0c00000000000000c0270900000000' +
  '00016a3103a31bacbe6b4b92d5e2c7a1b86cdd150fa705ad00e6d3d299799ae760b3ca9cf423c58779d52630465ddefa' +
  '80d973c71d00000000b3c297081bb3eff0a3acc628ef8081056a6f38fcf035ea66e6b3673abcccb55b66f9cfef5ebf2f' +
  '3bfc8246cec5de91e40192149aa30ee1c54f266be69b54b2b55de8e81933a4dd7bd716d0f77d4d092fb46b35085e7b28' +
  '4633d76b59fb8eff62';

function dsha256(data: Uint8Array): Buffer {
  return Buffer.from(sha256(sha256(data)));
}

/**
 * A signed transaction with a delegated staked output, built with
 * navio-blsct (navio-core 80c8703): UnsignedOutput.setStakeDelegation on a
 * StakedCommitment output, signed by UnsignedTransaction. Its staked output
 * has an 888-byte scriptPubKey and a 207-byte DATA predicate, both behind
 * multi-byte CompactSize lengths. The expected values below are what the
 * binding's CTxOut getters report for that output.
 */
const STAKED_TX_HEX =
  '2200000001616161616161616161616161616161616161616161616161616161616161616100ffffffff02ffffffffff' +
  'ffff7f0500000000000000fd7803b94d720306ab7e05b4485489ecafe10c138f1b2c2e4b58b49f8e3c960664adeb16e7' +
  '25f4bdc4743cad6c5db65d1b35dbbd0d667b1995fa1f116551b18bef303f14505cf199a72d594a7e0c52178860c78aaf' +
  '63b85674a305f837becb105608d70c67cdc62691a9c3530f0633be179d9d61c1d23a70b6d5fcb6ee84b33195128da0e9' +
  'fde7b31f2d923017a1b6abe47bf284133793189190814a4db7e3b3304ea23a6d21bed055f2e2f300ca51db12eb6c00bd' +
  '16205fd070ecb47b0b941150a6845253889c1080dc495d2bdf877635b8e8fe8fee30eec2e147ffbb4f4d375bd2c1c8fb' +
  '65c65479d0cf0e4b19119af5de7ca0f259bc1cb033f318c4da31942170cbbc0e72586100b90b766880d4108179dedd2e' +
  '455f62a598b158b9a2110def548aaa8fc56b0906957d70629d49680777c609f2271356de64e6e18a0d817292791e2814' +
  'fad2328faa92abac93d7b4141c60d08a97dcfdcc830f637bc5e4092cc47b4778b20b572c2eef1fc2e8219fe01681c156' +
  'e49587ea729ae583453119e9a72e8268142bc1f8a97f9567e6e064cf3b64a40ae265b92a133ba2ebfc5f1949bbfe4257' +
  '3b2ed5cf0e56aaa4c24edf2b548234b922b74efe8cb8db1ab461ae44e01479a11738f138dcd73546ad306281a96b412a' +
  'b348d4818ff0b56e6dc33aafbbfc2d0c630aba0ca39bc7acb5941bfd702a55fe001f06e9820d6a33fc0ccb97fa173d95' +
  '03ca045b33030da82e2e8fb5fc9f8d1ec746999d8fe33bde34de2054d1242185489efaff48a14a83be770013bb7367b6' +
  '002c023bef81dc2cc336399444242c216431d93ca697886c25217c206c27096d9dfa4c49de2a15fe8bef98f9db2b1ba7' +
  '92f09bf88224cab594d66dde93c95c5d509ee3fab2c56c3458d05eb3dde9e77dfb0e2cfdd8d25b203a1911ab78fb64c1' +
  'efa81611731984cae66ec7460f327d3fa7e2c442a41985db51b8970cacf1d92be419e96055986518d9e2bb5c645c67eb' +
  '9076b5e549e6077fac50df1ee136ded43aeaaaa457500f23e452ae0a6baf5c7fd7b7afdc1963d2b0079425f3f5dc31a0' +
  'f80202f400372b53ba43143f21eca5bdb24045750cf2eef37217f3f2cf3154f64b4a87fa5a05828ae99415b4aba6d66e' +
  '7e8a66a31c098f9e2ebf490764d0065c341e6e991180bd7c0f0fff806270248d16729a068281a1f49092a5e446fbd926' +
  '90bf2bd62b7309bd19f8ca8377ca2fe0e3905b67d05089af921d056588366ae1fe46abb97551019452aee15726f77e6a' +
  'da992fec6f69ad6b3f1cc189b791131f66a9ccbbb7a4aba4d9148e405a4dba053b2add7cb63c5206a1c015f84360bc23' +
  '0241e718b0c9c71114fffe9e1fbceae0bec0920d841fb40509638c8ab2877ec0ee798a8dff5b7256ad5626e135f601c5' +
  '18d7ae5a5677b9f39e5492c1dcd3ba300270e76145dd48a7f6fccbfc1fd7af4fe168fee1d89b2aa6a87cd69d4d2db199' +
  'c47cbd51e5199a1bddb1c46ce21fc108f3643d9d8edc2f66ad6824b9fb33cc20f4c925569a99eb4f986641decde306bb' +
  '8bf4934c0a86f5530e529e88fa2651d6c95d20873622c7e15c777eff8562bfc095891bf2f5d8bcd791b7c1887a539a47' +
  '44961a735cd83a5040fcbae49beea34106b029b43a261778cde4924917286b78944bb3b5a2fc954f8e0c6bb1f9f6ed57' +
  '3885c184a63a47dd64ccfda659e4308624be9c9763d6192a1003cdec32b884ff16b4709e1a43d90f068090142aa3afc2' +
  'b2c83cae098991034eb18ac2dc874423363b0cfd2341329dde491873407bab49529e6d8326cc0cd95caf16a544a86c3b' +
  'e0c3b9d6e8a8bf2e10dece03380033f47b4eadfa6ffdb42be41a1b9585f00e4c427da6127f802e01bfb75d95347bb931' +
  '58f5621c718d12b6bcadd29156775432d36bc4d2f3d20c2b333f590746a2c33dd04fcec189729bd09aa78b24bb528948' +
  '86b4e920c8f39ee337f1878d6845ed56c34feb98532cca448d86c1d6c642f072444aeabbef002db12888a8f5016ec94d' +
  '23f9316539a05b623b74238d15fdd5a83e594b0acd3af024105921557cff5961bc99d2d951b63683e9b87bdf47419304' +
  '994ba91a5adff67ca0554e6fec780fb83827b15274bde795a215c32a5626ab1a1c190faec19cd40d86856fb9d47d8206' +
  'b364325a5887e2ba9d1154f3d39aa1ddc1ce881c348eb297a3870658f1305834252bf3193583bf321ea4ddb2ba13df1e' +
  '222120bb316bfe682fa672de638f288d7927885e851071ae005dd17821640260b46e2ba9adcb201488b761618c781cf6' +
  '3a0ddca034b8e2c1a5aef00a8d696e77e444b1922f63a966328be331b1932a3aec1f533dccc542e61934cd1694209b34' +
  '541246df72f750cb86ad68dfc4676c056ffcaf99cec79f04e34f232ac12ef2f999ee2278c9ccbf498c4af456c7a032d5' +
  '57c0c1022f76ce7d294343670de8e4ac6086795c020664e13685ff05bfd92548e8894d49b45b2ec3cb1180bd7c0f0fff' +
  '806270248d16729a068281a1f49092a5e446fbd92690bf2bd62b7309bd19f8ca8377ca2fe0e3905b67d05089af921d05' +
  '6588366ae1fe46abb9aefec0b79ba2f161ddd00d8f3752ea36f67c875cff5de77ed8fe217327bace2dfc6f41bce113f4' +
  'ffa038fc9d8357ef1fab0a1f06c1bff9ca1d9d77be4a2e31bf8fb316d2df66d7294b1121030506cc9476f7c1ddce0a6c' +
  'f7e2d6b46597f853cf8c7b0e11f9bc3f48d84013ef8e8575aeb764bc1b9bf15938d19eb191201011365c2b14d78139a0' +
  'f27327cb21c1b8bf3d098dcf04cd4e564447018f9294d23fdabdd9865352eb6a8319d97ccea0dbc5202733dee5309809' +
  '3742ad33a5eab1cf3d921b7c10c6dc132304954f00226dfdd0695ffa9702e65a961f8443814df2a74997d348e2a9e717' +
  '584f71223685b306cd09a083ad9e7ce145281d94be9b741803e7e5a695d9a8e667b2ad5497d935ac1b437ef2baedc1f9' +
  '189116dec14bb541e885a9699a2a4d2104d61b0686e38e4f2b3bbe0a6ec32a98257606eb4dfd24e97b1935ecfdcb4772' +
  '26fd7eecb3f585854e10c9100575c00ff0cfd605596c93f0bdb786ffffffffffffff7f0c00000000000000e803000000' +
  '000000016a310385ac8b1d86697f763b53706f2c408b9a890f1d5e0687c03e1883227a7f329e04e437cb027a8f3f80dd' +
  '57c66ffb4ad08e00000000a4ca0d54cfc5e2554177d72ad4ed86ea802320add2cb8095408118ee9ee6f91266c2200dbe' +
  '04ad0f4a530e75778830df11141e1a6155b1a44e341c1e38242cb98974c9f7c3cf302e1e7baabd875875ecadc499023c' +
  'ae90bc126e69e8955ae41d';
const STAKED_SCRIPT_HEX =
  'b94d720306ab7e05b4485489ecafe10c138f1b2c2e4b58b49f8e3c960664adeb16e725f4bdc4743cad6c5db65d1b35db' +
  'bd0d667b1995fa1f116551b18bef303f14505cf199a72d594a7e0c52178860c78aaf63b85674a305f837becb105608d7' +
  '0c67cdc62691a9c3530f0633be179d9d61c1d23a70b6d5fcb6ee84b33195128da0e9fde7b31f2d923017a1b6abe47bf2' +
  '84133793189190814a4db7e3b3304ea23a6d21bed055f2e2f300ca51db12eb6c00bd16205fd070ecb47b0b941150a684' +
  '5253889c1080dc495d2bdf877635b8e8fe8fee30eec2e147ffbb4f4d375bd2c1c8fb65c65479d0cf0e4b19119af5de7c' +
  'a0f259bc1cb033f318c4da31942170cbbc0e72586100b90b766880d4108179dedd2e455f62a598b158b9a2110def548a' +
  'aa8fc56b0906957d70629d49680777c609f2271356de64e6e18a0d817292791e2814fad2328faa92abac93d7b4141c60' +
  'd08a97dcfdcc830f637bc5e4092cc47b4778b20b572c2eef1fc2e8219fe01681c156e49587ea729ae583453119e9a72e' +
  '8268142bc1f8a97f9567e6e064cf3b64a40ae265b92a133ba2ebfc5f1949bbfe42573b2ed5cf0e56aaa4c24edf2b5482' +
  '34b922b74efe8cb8db1ab461ae44e01479a11738f138dcd73546ad306281a96b412ab348d4818ff0b56e6dc33aafbbfc' +
  '2d0c630aba0ca39bc7acb5941bfd702a55fe001f06e9820d6a33fc0ccb97fa173d9503ca045b33030da82e2e8fb5fc9f' +
  '8d1ec746999d8fe33bde34de2054d1242185489efaff48a14a83be770013bb7367b6002c023bef81dc2cc33639944424' +
  '2c216431d93ca697886c25217c206c27096d9dfa4c49de2a15fe8bef98f9db2b1ba792f09bf88224cab594d66dde93c9' +
  '5c5d509ee3fab2c56c3458d05eb3dde9e77dfb0e2cfdd8d25b203a1911ab78fb64c1efa81611731984cae66ec7460f32' +
  '7d3fa7e2c442a41985db51b8970cacf1d92be419e96055986518d9e2bb5c645c67eb9076b5e549e6077fac50df1ee136' +
  'ded43aeaaaa457500f23e452ae0a6baf5c7fd7b7afdc1963d2b0079425f3f5dc31a0f80202f400372b53ba43143f21ec' +
  'a5bdb24045750cf2eef37217f3f2cf3154f64b4a87fa5a05828ae99415b4aba6d66e7e8a66a31c098f9e2ebf490764d0' +
  '065c341e6e991180bd7c0f0fff806270248d16729a068281a1f49092a5e446fbd92690bf2bd62b7309bd19f8ca8377ca' +
  '2fe0e3905b67d05089af921d056588366ae1fe46abb97551';
const STAKED_PREDICATE_HEX =
  '04cd4e564447018f9294d23fdabdd9865352eb6a8319d97ccea0dbc5202733dee53098093742ad33a5eab1cf3d921b7c' +
  '10c6dc132304954f00226dfdd0695ffa9702e65a961f8443814df2a74997d348e2a9e717584f71223685b306cd09a083' +
  'ad9e7ce145281d94be9b741803e7e5a695d9a8e667b2ad5497d935ac1b437ef2baedc1f9189116dec14bb541e885a969' +
  '9a2a4d2104d61b0686e38e4f2b3bbe0a6ec32a98257606eb4dfd24e97b1935ecfdcb477226fd7eecb3f585854e10c910' +
  '0575c00ff0cfd605596c93f0bdb786';
const STAKED_EPHEMERAL_KEY =
  '8c7b0e11f9bc3f48d84013ef8e8575aeb764bc1b9bf15938d19eb191201011365c2b14d78139a0f27327cb21c1b8bf3d';

describe('p2p-block-parser', () => {
  it('parses a BLSCT transaction and computes the node txid', () => {
    const raw = Buffer.from(NODE_TX_HEX, 'hex');
    const tx = parseTransaction(raw, 0);

    expect(tx.txid).toBe(NODE_TX_ID);
    expect(tx.wtxid).toBe(NODE_TX_ID);
    expect(tx.hasWitness).toBe(false);
    expect(tx.isBlsct).toBe(true);
    expect(tx.start).toBe(0);
    expect(tx.end).toBe(raw.length);
    expect(tx.rawHex).toBe(NODE_TX_HEX);
    expect(computeTxid(raw)).toBe(NODE_TX_ID);

    // One input (COutPoint carries only a hash), three outputs:
    // recipient, fee (transparent, no BLSCT data), change
    expect(tx.inputHashes).toHaveLength(1);
    expect(tx.outputs).toHaveLength(3);
    const withKeys = tx.outputs.filter(o => o.keys !== null);
    expect(withKeys).toHaveLength(2);
    expect(tx.outputs.filter(o => o.keys === null)).toHaveLength(1); // the fee output

    const recipient = tx.outputs.find(o => o.outputHash === NODE_TX_RECIPIENT_OUTPUT_HASH);
    expect(recipient).toBeDefined();
    expect(recipient!.keys!.outputHash).toBe(NODE_TX_RECIPIENT_OUTPUT_HASH);
    expect(recipient!.keys!.hasRangeProof).toBe(true);
    expect(recipient!.keys!.spendingKey).toHaveLength(96);
    expect(recipient!.keys!.blindingKey).toHaveLength(96);
    expect(recipient!.keys!.ephemeralKey).toHaveLength(96);
    expect(recipient!.keys!.viewTag).toBeGreaterThanOrEqual(0);
    expect(recipient!.keys!.viewTag).toBeLessThan(0x10000);

    // The output hash is the double SHA256 of the serialized CTxOut
    const serialized = Buffer.from(recipient!.serializedHex, 'hex');
    expect(dsha256(serialized).reverse().toString('hex')).toBe(NODE_TX_RECIPIENT_OUTPUT_HASH);
    // Outputs are contiguous and cover the vout section exactly
    const total = tx.outputs.reduce((n, o) => n + o.serializedHex.length / 2, 0);
    expect(total).toBeGreaterThan(0);
    expect(NODE_TX_HEX.includes(tx.outputs.map(o => o.serializedHex).join(''))).toBe(true);
  });

  it('links the SDK spend to the node payment by output hash', () => {
    const tx = parseTransaction(Buffer.from(SDK_TX_HEX, 'hex'), 0);
    expect(tx.txid).toBe(SDK_TX_ID);
    expect(tx.inputHashes).toEqual([NODE_TX_RECIPIENT_OUTPUT_HASH]);
    expect(tx.outputs).toHaveLength(3);
  });

  it('parses transactions at an offset inside a larger buffer', () => {
    const a = Buffer.from(NODE_TX_HEX, 'hex');
    const b = Buffer.from(SDK_TX_HEX, 'hex');
    const buf = Buffer.concat([a, b]);
    const first = parseTransaction(buf, 0);
    const second = parseTransaction(buf, first.end);
    expect(first.txid).toBe(NODE_TX_ID);
    expect(second.txid).toBe(SDK_TX_ID);
    expect(second.end).toBe(buf.length);
  });

  it('strips witness data when computing the txid', () => {
    // Wrap the node tx in the extended (witness) serialization with one
    // witness item per input: version | 00 01 | vin | vout | witness | locktime | sig
    const raw = Buffer.from(NODE_TX_HEX, 'hex');
    const tx = parseTransaction(raw, 0);
    const version = raw.subarray(0, 4);
    const tail = raw.subarray(raw.length - 4 - 96); // locktime + BLSCT signature
    const body = raw.subarray(4, raw.length - tail.length); // vin + vout
    const witness = Buffer.from([0x01, 0x03, 0xaa, 0xbb, 0xcc]); // 1 item of 3 bytes
    const extended = Buffer.concat([version, Buffer.from([0x00, 0x01]), body, witness, tail]);

    const parsed = parseTransaction(extended, 0);
    expect(parsed.hasWitness).toBe(true);
    expect(parsed.txid).toBe(tx.txid);
    expect(parsed.wtxid).not.toBe(tx.txid);
    expect(parsed.wtxid).toBe(dsha256(extended).reverse().toString('hex'));
    expect(parsed.end).toBe(extended.length);
    expect(parsed.outputs.map(o => o.outputHash)).toEqual(tx.outputs.map(o => o.outputHash));
  });

  it('parses a PoW block (header + tx count + transactions)', () => {
    const header = Buffer.alloc(80);
    header.writeInt32LE(0x40000000, 0); // VERSION_BIT_BLSCT, not PoS
    header.writeUInt32LE(1700000000, 68);
    const txs = [Buffer.from(NODE_TX_HEX, 'hex'), Buffer.from(SDK_TX_HEX, 'hex')];
    const block = Buffer.concat([header, Buffer.from([txs.length]), ...txs]);

    const parsed = parseBlock(block);
    expect(parsed.hash).toBe(dsha256(header).reverse().toString('hex'));
    expect(parsed.headerHex).toBe(header.toString('hex'));
    expect(parsed.isPoS).toBe(false);
    expect(parsed.timestamp).toBe(1700000000);
    expect(parsed.txs.map(t => t.txid)).toEqual([NODE_TX_ID, SDK_TX_ID]);
  });

  it('parses a staked output behind multi-byte CompactSize lengths', () => {
    const tx = parseTransaction(Buffer.from(STAKED_TX_HEX, 'hex'));
    const staked = tx.outputs.filter(o => o.scriptPubKeyHex.startsWith('b9'));
    expect(staked).toHaveLength(1);
    expect(staked[0].scriptPubKeyHex).toBe(STAKED_SCRIPT_HEX);
    expect(staked[0].predicateHex).toBe(STAKED_PREDICATE_HEX);
    expect(staked[0].keys?.ephemeralKey).toBe(STAKED_EPHEMERAL_KEY);
    expect(staked[0].transparentValue).toBeNull();
    expect(staked[0].rangeProofHex?.length).toBeGreaterThan(2);
  });

  it('parses a single serialized output as it parses inside a transaction', () => {
    const tx = parseTransaction(Buffer.from(STAKED_TX_HEX, 'hex'));
    for (const output of tx.outputs) {
      expect(parseOutputHex(output.serializedHex)).toEqual({ ...output, index: 0 });
    }
    const [first] = tx.outputs;
    expect(() => parseOutputHex(first.serializedHex + '00')).toThrow(/Trailing/);
    expect(() => parseOutputHex(first.serializedHex.slice(0, -2))).toThrow(/Truncated/);
  });

  it('rejects truncated data instead of mis-parsing it', () => {
    const raw = Buffer.from(NODE_TX_HEX, 'hex');
    expect(() => parseTransaction(raw.subarray(0, raw.length - 10), 0)).toThrow(/Truncated/);
    const header = Buffer.alloc(80);
    expect(() =>
      parseBlock(Buffer.concat([header, Buffer.from([1]), raw.subarray(0, 100)]))
    ).toThrow();
    // trailing garbage after the last tx
    expect(() =>
      parseBlock(Buffer.concat([header, Buffer.from([1]), raw, Buffer.from([0])]))
    ).toThrow(/mismatch/);
  });
});

describe('P2PClient codec helpers', () => {
  it('parses navio headers messages (bare 80-byte headers)', () => {
    const h1 = Buffer.alloc(80, 1);
    const h2 = Buffer.alloc(80, 2);
    const payload = Buffer.concat([Buffer.from([2]), h1, h2]);
    const headers = P2PClient.parseHeadersMessage(payload);
    expect(headers).toHaveLength(2);
    expect(headers[0].equals(h1)).toBe(true);
    expect(headers[1].equals(h2)).toBe(true);
    expect(P2PClient.parseHeadersMessage(Buffer.from([0]))).toEqual([]);
    expect(P2PClient.parseHeadersMessage(Buffer.alloc(0))).toEqual([]);
  });

  it('tolerates Bitcoin-style headers messages (trailing tx-count byte)', () => {
    const h1 = Buffer.alloc(80, 1);
    const payload = Buffer.concat([Buffer.from([1]), h1, Buffer.from([0])]);
    const headers = P2PClient.parseHeadersMessage(payload);
    expect(headers).toHaveLength(1);
    expect(headers[0].equals(h1)).toBe(true);
    expect(() =>
      P2PClient.parseHeadersMessage(Buffer.concat([Buffer.from([1]), Buffer.alloc(50)]))
    ).toThrow(/Malformed/);
  });

  it('round-trips inventory payloads', () => {
    const client = new P2PClient({ host: '127.0.0.1', network: 'regtest' });
    const hash = Buffer.alloc(32, 7);
    const payload = client.buildInvPayload([
      { type: InvType.MSG_WITNESS_BLOCK, hash },
      { type: InvType.MSG_OUTPUT_HASH, hash },
    ]);
    const invs = P2PClient.parseInvPayload(payload);
    expect(invs).toHaveLength(2);
    expect(invs[0].type).toBe(InvType.MSG_WITNESS_BLOCK);
    expect(invs[1].type).toBe(InvType.MSG_OUTPUT_HASH);
    expect(invs[0].hash.equals(hash)).toBe(true);
    expect(P2PClient.parseInvPayload(Buffer.alloc(0))).toEqual([]);
  });

  it('uses the navio-core network magic and default ports', () => {
    expect(() => new P2PClient({ host: 'x', network: 'signet' as any })).toThrow(/Unsupported/);
    const mainnet = new P2PClient({ host: 'x', network: 'mainnet' });
    const testnet = new P2PClient({ host: 'x', network: 'testnet' });
    const regtest = new P2PClient({ host: 'x', network: 'regtest' });
    expect((mainnet as any).magic.toString('hex')).toBe('bd5fc300');
    expect((testnet as any).magic.toString('hex')).toBe('2467d2c1');
    expect((regtest as any).magic.toString('hex')).toBe('fdbf9ffb');
    expect((mainnet as any).options.port).toBe(48470);
    expect((testnet as any).options.port).toBe(33670);
    expect((regtest as any).options.port).toBe(18444);
  });

  it('encodes and decodes varints', () => {
    const client = new P2PClient({ host: '127.0.0.1', network: 'regtest' });
    for (const n of [0, 1, 0xfc, 0xfd, 0xffff, 0x10000, 0xffffffff, 0x100000000]) {
      const enc = client.encodeVarInt(n);
      const dec = client.decodeVarInt(enc);
      expect(Number(dec.value)).toBe(n);
      expect(dec.bytesRead).toBe(enc.length);
    }
  });
});
