<?php
$data = file_get_contents("php://input");

if ($data) {
    file_put_contents("data.json", $data);
    echo "OK";
} else {
    http_response_code(400);
    echo "Error";
}
?>
